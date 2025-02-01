import { getMarkRange, Range } from '@tiptap/core'
import { MarkType } from '@tiptap/pm/model'
import {
	Box,
	clamp,
	debounce,
	Editor,
	TiptapEditor,
	tltime,
	track,
	useAtom,
	useEditor,
	useQuickReactor,
	useReactor,
	useValue,
	Vec,
} from '@tldraw/editor'
import React, {
	MutableRefObject,
	RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react'
import { TldrawUiContextualToolbar } from '../primitives/TldrawUiContextualToolbar'
import { DefaultRichTextToolbarContent } from './DefaultRichTextToolbarContent'
import { LinkEditor } from './LinkEditor'

/** @public */
export interface TLUiRichTextToolbarProps {
	children?: React.ReactNode
}

/**
 * The default rich text toolbar.
 *
 * @public @react
 */
export const DefaultRichTextToolbar = track(function DefaultRichTextToolbar({
	children,
}: TLUiRichTextToolbarProps) {
	const editor = useEditor()

	const textEditor = useValue('textEditor', () => editor.getEditingShapeTipTapTextEditor(), [
		editor,
	])

	const [isMousingDown, setIsMousingDown] = useState(false)

	// Set up general event listeners for text selection.
	useEffect(() => {
		if (!textEditor) return

		const handlePointingStateChange = debounce(({ isPointing }: { isPointing: boolean }) => {
			setIsMousingDown(isPointing)
		}, 16)

		// sorry
		textEditor.on<any>('pointer-state-change', handlePointingStateChange)
		return () => {
			// sorry
			textEditor.off<any>('pointer-state-change', handlePointingStateChange)
		}
	}, [textEditor])

	const isVisible =
		// must have a text editor and its state
		!!textEditor &&
		textEditor.state &&
		// must be editing a shape
		editor.isInAny('select.editing_shape') &&
		// standard rule
		(!isMousingDown ||
			// exceptions
			textEditor.isActive('link'))

	if (!isVisible) return null

	return <ContextualToolbarInner textEditor={textEditor}>{children}</ContextualToolbarInner>
})

function ContextualToolbarInner({
	textEditor,
	children,
}: {
	children?: React.ReactNode
	textEditor: TiptapEditor
}) {
	const editor = useEditor()

	const rToolbar = useRef<HTMLDivElement>(null)

	const rIsShowing = useRef(false)

	const rPrevX = useRef(-1)
	const rPrevCamera = useRef(new Vec(-100, -100, 1))

	useLayoutEffect(function hideTheToolbarOnFirstLoad() {
		rPrevX.current = -1
		rPrevCamera.current = new Vec(-100, -100, 1)
		hideToolbarElement(rToolbar, rIsShowing)
	}, [])

	const { isEditingLink, onEditLinkStart, onEditLinkComplete } = useEditingLinkBehavior(textEditor)

	// We use an atom to force the toolbar position to update
	// This gets triggered when:
	// - the selection changes
	// - the shape changes
	const forcePositionUpdateAtom = useAtom('force toolbar position update', 0)

	useEffect(
		function forceUpdateWhenSelectionUpdates() {
			function handleSelectionUpdate() {
				forcePositionUpdateAtom.update((t) => t + 1)
			}
			// Run me once after a raf to force the toolbar position to update immediately.
			// This is needed in order to capture a "select all" moment, e.g. when
			// double clicking a geo shape to edit its text. We need the raf to let the selection occur.
			tltime.requestAnimationFrame('first forced update', handleSelectionUpdate)
			textEditor.on('selectionUpdate', handleSelectionUpdate)
			return () => {
				textEditor.off('selectionUpdate', handleSelectionUpdate)
			}
		},
		[textEditor, forcePositionUpdateAtom]
	)

	useReactor(
		'shape change',
		function forceUpdateOnNextFrameWhenShapeChanges() {
			// Ok, this is crazy bullshit but here's what's happening:
			// 1. the editing shape updates
			// 2. the shape's position changes (maybe) based on its new size
			// 3. we force an update
			// 4. we update the toolbar position
			// It's IMPORTANT that this is a normal "useReactor" and not a "useQuickReactor",
			// so that the force update happens on the NEXT FRAME after the change. It takes a
			// frame between 2 and 3 for the shape to update its position. If we don't wait, then
			// we race the shape's position update and the measurement of the selection screen rects.
			// If you really want to test this, try changing this to a "useQuickReactor", select a
			// shape's text, and then use the style panel to change the shape's size.

			editor.getEditingShape() // capture the editing shape
			forcePositionUpdateAtom.update((t) => t + 1)
		},
		[editor]
	)

	useQuickReactor(
		'toolbar position',
		function updateToolbarPositionAndDisplay() {
			const toolbarElm = rToolbar.current
			if (!toolbarElm) return

			// capture / force this to update when...
			const camera = editor.getCamera() // the camera moves
			forcePositionUpdateAtom.get() // the selection changes

			const position = getToolbarScreenPosition(editor, toolbarElm)

			if (!position) {
				// If we don't have a position, then we're not showing the toolbar
				hideToolbarElement(rToolbar, rIsShowing)
				return
			}

			if (
				Math.abs(position.x - rPrevX.current) > 32 ||
				!Vec.EqualsXY(rPrevCamera.current, camera.x, camera.y)
			) {
				// We're showing the toolbar. Move the toolbar to its correct location
				toolbarElm.style.setProperty('transform', `translate(${position.x}px, ${position.y}px)`)
				rPrevX.current = position.x
				rPrevCamera.current.x = camera.x
				rPrevCamera.current.y = camera.y
			}

			// Finally, if the toolbar was previously hidden, show it again
			showToolbarElement(rToolbar, rIsShowing)
		},
		[editor, textEditor, forcePositionUpdateAtom]
	)

	return (
		<TldrawUiContextualToolbar
			ref={rToolbar}
			className="tl-rich-text__toolbar tl-rich-text__toolbar__hidden"
		>
			{children ? (
				children
			) : isEditingLink ? (
				<LinkEditor
					textEditor={textEditor}
					value={textEditor.isActive('link') ? textEditor.getAttributes('link').href : ''}
					onComplete={onEditLinkComplete}
				/>
			) : (
				<DefaultRichTextToolbarContent textEditor={textEditor} onEditLinkStart={onEditLinkStart} />
			)}
		</TldrawUiContextualToolbar>
	)
}

// For convenience, let's work just with boxes here
function rectToBox(rect: DOMRect): Box {
	return new Box(rect.x, rect.y, rect.width, rect.height)
}

// This is a mouthful and is repeated in a few places, so let's put it
// here as its own function.
function hideToolbarElement(
	toolbarElmRef: RefObject<HTMLElement>,
	isShowingRef: MutableRefObject<boolean>
) {
	if (!isShowingRef.current) return
	const toolbarElm = toolbarElmRef.current
	if (toolbarElm) {
		toolbarElm.style.setProperty('transform', `translate(-1000px, -1000px)`)
		toolbarElm.classList.add('tl-rich-text__toolbar__hidden')
	}
	isShowingRef.current = false
}

// So far this is only used once but I'll put it here too so that we can
// look at the two together.
function showToolbarElement(
	toolbarElmRef: RefObject<HTMLElement>,
	isShowingRef: MutableRefObject<boolean>
) {
	if (isShowingRef.current) return
	const toolbarElm = toolbarElmRef.current
	if (toolbarElm) {
		toolbarElm.classList.remove('tl-rich-text__toolbar__hidden')
	}
	isShowingRef.current = true
}

// Extracted here
function getToolbarScreenPosition(editor: Editor, toolbarElm: HTMLElement) {
	// Get the text selection rects as a box. This will be undefined if there are no selections.
	const selection = window.getSelection()

	// If there are no selections, don't return a box
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

	// Get a common box from all of the ranges' screen rects
	const rangeBoxes: Box[] = []
	for (let i = 0; i < selection.rangeCount; i++) {
		const range = selection.getRangeAt(i)
		rangeBoxes.push(rectToBox(range.getBoundingClientRect()))
	}

	const selectionBounds = Box.Common(rangeBoxes)

	// Offset the selection bounds by the viewport screen bounds (if the editor is scrolled or inset, etc)
	const vsb = editor.getViewportScreenBounds()
	selectionBounds.x -= vsb.x
	selectionBounds.y -= vsb.y

	// If the selection bounds are too far off of the screen, don't show the toolbar
	if (
		selectionBounds.maxY < SCREEN_MARGIN ||
		selectionBounds.y > vsb.h - SCREEN_MARGIN ||
		selectionBounds.maxX < SCREEN_MARGIN ||
		selectionBounds.x > vsb.w - SCREEN_MARGIN
	) {
		return
	}

	// Get the toolbar's screen rect as a box. Do this after we verify that there is at least one selection.
	const toolbarBounds = rectToBox(toolbarElm.getBoundingClientRect())

	// Chance these are NaN? Rare case.
	if (!toolbarBounds.width || !toolbarBounds.height) return

	// Thrashy, only do this if we're showing the toolbar
	// ! this might not be needed, the container never scrolls
	const { scrollLeft, scrollTop } = editor.getContainer()

	// We want to position the toolbar so that it is centered over the selection
	// except in the cases where it would extend off the edge of the screen. If
	// the re-positioned toolbar is too far from the selection, we'll hide it.

	// Start by placing the top left corner of the toolbar so that the
	// toolbar would be centered above the section bounds, bumped up by the

	let x = selectionBounds.midX - toolbarBounds.w / 2
	let y = selectionBounds.y - toolbarBounds.h - TOOLBAR_GAP

	// Clamp the position on screen.
	x = clamp(x, SCREEN_MARGIN, vsb.w - toolbarBounds.w - SCREEN_MARGIN)
	y = clamp(y, SCREEN_MARGIN, vsb.h - toolbarBounds.h - SCREEN_MARGIN)

	// Offset the position by the container's scroll position
	x += scrollLeft
	y += scrollTop

	// Round the position to the nearest pixel
	x = Math.round(x)
	y = Math.round(y)

	return { x, y }
}

function useEditingLinkBehavior(textEditor?: TiptapEditor) {
	const [isEditingLink, setIsEditingLink] = useState(false)

	// Set up text editor event listeners.
	useEffect(() => {
		if (!textEditor) {
			setIsEditingLink(false)
			return
		}

		const handleClick = () => {
			const isLinkActive = textEditor.isActive('link')
			setIsEditingLink(isLinkActive)
		}

		textEditor.view.dom.addEventListener('click', handleClick)
		return () => {
			textEditor.view.dom.removeEventListener('click', handleClick)
		}
	}, [textEditor, isEditingLink])

	// If we're editing a link, select the entire link.
	// This can happen via a click or via keyboarding over to the link and then
	// clicking the toolbar button.
	useEffect(() => {
		if (!textEditor) {
			return
		}

		// N.B. This specifically isn't checking the isEditingLink state but
		// the current active state of the text editor. This is because there's
		// a subtelty where when going edit-to-edit, that is text editor-to-text editor
		// in different shapes, the isEditingLink state doesn't get reset quickly enough.
		if (textEditor.isActive('link')) {
			try {
				const { from, to } = getMarkRange(
					textEditor.state.doc.resolve(textEditor.state.selection.from),
					textEditor.schema.marks.link as MarkType
				) as Range
				// Select the entire link if we just clicked on it while in edit mode, but not if there's
				// a specific selection.
				if (textEditor.state.selection.empty) {
					textEditor.commands.setTextSelection({ from, to })
				}
			} catch {
				// Sometimes getMarkRange throws an error when the selection is the entire document.
				// This is somewhat mysterious but it's harmless. We just need to ignore it.
				// Also, this seems to have recently broken with the React 19 preparation changes.
			}
		}
	}, [textEditor, isEditingLink])

	const onEditLinkStart = useCallback(() => {
		setIsEditingLink(true)
	}, [])

	const onEditLinkCancel = useCallback(() => {
		setIsEditingLink(false)
	}, [])

	const onEditLinkComplete = useCallback(() => {
		setIsEditingLink(false)
		if (!textEditor) return
		const from = textEditor.state.selection.from
		textEditor.commands.setTextSelection({ from, to: from })
	}, [textEditor])

	return { isEditingLink, onEditLinkStart, onEditLinkComplete, onEditLinkCancel }
}

const TOOLBAR_GAP = 8

const SCREEN_MARGIN = 16
