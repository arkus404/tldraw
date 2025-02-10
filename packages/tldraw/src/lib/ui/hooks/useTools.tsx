import {
	assertExists,
	createShapeId,
	Editor,
	GeoShapeGeoStyle,
	TLPointerEventInfo,
	TLShapeId,
	useEditor,
} from '@tldraw/editor'
import * as React from 'react'
import { EmbedDialog } from '../components/EmbedDialog'
import { TLUiEventSource, useUiEvents } from '../context/events'
import { TLUiIconType } from '../icon-types'
import { useDefaultHelpers } from '../overrides'
import { TLUiTranslationKey } from './useTranslation/TLUiTranslationKey'

/** @public */
export interface TLUiToolItem<
	TranslationKey extends string = string,
	IconType extends string = string,
> {
	id: string
	label: TranslationKey
	shortcutsLabel?: TranslationKey
	icon: IconType
	onSelect(source: TLUiEventSource): void
	onDragStart?(source: TLUiEventSource, info: TLPointerEventInfo): void
	kbd?: string
	readonlyOk?: boolean
	meta?: {
		[key: string]: any
	}
}

/** @public */
export type TLUiToolsContextType = Record<string, TLUiToolItem>

/** @internal */
export const ToolsContext = React.createContext<null | TLUiToolsContextType>(null)

/** @public */
export interface TLUiToolsProviderProps {
	overrides?(
		editor: Editor,
		tools: TLUiToolsContextType,
		helpers: {
			insertMedia(): void
		}
	): TLUiToolsContextType
	children: React.ReactNode
}

/** @internal */
export function ToolsProvider({ overrides, children }: TLUiToolsProviderProps) {
	const editor = useEditor()
	const trackEvent = useUiEvents()

	const helpers = useDefaultHelpers()

	const tools = React.useMemo<TLUiToolsContextType>(() => {
		const toolsArray: TLUiToolItem<TLUiTranslationKey, TLUiIconType>[] = [
			{
				id: 'select',
				label: 'tool.select',
				icon: 'tool-pointer',
				kbd: 'v',
				readonlyOk: true,
				onSelect(source) {
					if (editor.isIn('select')) {
						// There's a quirk of select mode, where editing a shape is a sub-state of select.
						// Because the text tool can be locked/sticky, we need to make sure we exit the
						// text tool.
						//
						// psst, if you're changing this code, also change the code
						// in strange-tools.test.ts! Sadly it's duplicated there.
						const currentNode = editor.root.getCurrent()!
						currentNode.exit({}, currentNode.id)
						currentNode.enter({}, currentNode.id)
					}
					editor.setCurrentTool('select')
					trackEvent('select-tool', { source, id: 'select' })
				},
			},
			{
				id: 'hand',
				label: 'tool.hand',
				icon: 'tool-hand',
				kbd: 'h',
				readonlyOk: true,
				onSelect(source) {
					editor.setCurrentTool('hand')
					trackEvent('select-tool', { source, id: 'hand' })
				},
			},
			{
				id: 'eraser',
				label: 'tool.eraser',
				icon: 'tool-eraser',
				kbd: 'e',
				onSelect(source) {
					editor.setCurrentTool('eraser')
					trackEvent('select-tool', { source, id: 'eraser' })
				},
			},
			{
				id: 'draw',
				label: 'tool.draw',
				icon: 'tool-pencil',
				kbd: 'd,b,x',
				onSelect(source) {
					editor.setCurrentTool('draw')
					trackEvent('select-tool', { source, id: 'draw' })
				},
			},
			...[...GeoShapeGeoStyle.values].map((geo) => ({
				id: geo,
				label: `tool.${geo}` as TLUiTranslationKey,
				meta: {
					geo,
				},
				kbd: geo === 'rectangle' ? 'r' : geo === 'ellipse' ? 'o' : undefined,
				icon: ('geo-' + geo) as TLUiIconType,
				onSelect(source: TLUiEventSource) {
					editor.run(() => {
						editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
						editor.setCurrentTool('geo')
						trackEvent('select-tool', { source, id: `geo-${geo}` })
					})
				},
				onDragStart(source: TLUiEventSource, info: TLPointerEventInfo) {
					onDragFromToolbarToCreateShape(editor, info, {
						createShape: (id) => editor.createShape({ id, type: 'geo', props: { geo } }),
					})
					trackEvent('drag-tool', { source, id: 'geo' })
				},
			})),
			{
				id: 'arrow',
				label: 'tool.arrow',
				icon: 'tool-arrow',
				kbd: 'a',
				onSelect(source) {
					editor.setCurrentTool('arrow')
					trackEvent('select-tool', { source, id: 'arrow' })
				},
				onDragStart(source: TLUiEventSource, info: TLPointerEventInfo) {
					onDragFromToolbarToCreateShape(editor, info, {
						createShape: (id) =>
							editor.createShape({
								id,
								type: 'arrow',
								props: { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
							}),
					})
					trackEvent('drag-tool', { source, id: 'arrow' })
				},
			},
			{
				id: 'line',
				label: 'tool.line',
				icon: 'tool-line',
				kbd: 'l',
				onSelect(source) {
					editor.setCurrentTool('line')
					trackEvent('select-tool', { source, id: 'line' })
				},
			},
			{
				id: 'frame',
				label: 'tool.frame',
				icon: 'tool-frame',
				kbd: 'f',
				onSelect(source) {
					editor.setCurrentTool('frame')
					trackEvent('select-tool', { source, id: 'frame' })
				},
				onDragStart(source, info) {
					onDragFromToolbarToCreateShape(editor, info, {
						createShape: (id) => editor.createShape({ id, type: 'frame' }),
					})
					trackEvent('drag-tool', { source, id: 'frame' })
				},
			},
			{
				id: 'text',
				label: 'tool.text',
				icon: 'tool-text',
				kbd: 't',
				onSelect(source) {
					editor.setCurrentTool('text')
					trackEvent('select-tool', { source, id: 'text' })
				},
				onDragStart(source, info) {
					onDragFromToolbarToCreateShape(editor, info, {
						createShape: (id) => editor.createShape({ id, type: 'text', props: { text: 'Text' } }),
						onDragEnd: (id) => {
							editor.emit('select-all-text', { shapeId: id })
							editor.setEditingShape(id)
						},
					})
					trackEvent('drag-tool', { source, id: 'text' })
				},
			},
			{
				id: 'asset',
				label: 'tool.asset',
				icon: 'tool-media',
				kbd: '$u',
				onSelect(source) {
					helpers.insertMedia()
					trackEvent('select-tool', { source, id: 'media' })
				},
			},
			{
				id: 'note',
				label: 'tool.note',
				icon: 'tool-note',
				kbd: 'n',
				onSelect(source) {
					editor.setCurrentTool('note')
					trackEvent('select-tool', { source, id: 'note' })
				},
				onDragStart(source, info) {
					onDragFromToolbarToCreateShape(editor, info, {
						createShape: (id) => editor.createShape({ id, type: 'note' }),
						onDragEnd: (id) => {
							editor.emit('select-all-text', { shapeId: id })
							editor.setEditingShape(id)
						},
					})
					trackEvent('drag-tool', { source, id: 'note' })
				},
			},
			{
				id: 'laser',
				label: 'tool.laser',
				readonlyOk: true,
				icon: 'tool-laser',
				kbd: 'k',
				onSelect(source) {
					editor.setCurrentTool('laser')
					trackEvent('select-tool', { source, id: 'laser' })
				},
			},
			{
				id: 'embed',
				label: 'tool.embed',
				icon: 'dot',
				onSelect(source) {
					helpers.addDialog({ component: EmbedDialog })
					trackEvent('select-tool', { source, id: 'embed' })
				},
			},
			{
				id: 'highlight',
				label: 'tool.highlight',
				icon: 'tool-highlight',
				// TODO: pick a better shortcut
				kbd: '!d',
				onSelect(source) {
					editor.setCurrentTool('highlight')
					trackEvent('select-tool', { source, id: 'highlight' })
				},
			},
		]

		toolsArray.push()

		const tools = Object.fromEntries(toolsArray.map((t) => [t.id, t]))

		if (overrides) {
			return overrides(editor, tools, helpers)
		}

		return tools
	}, [overrides, editor, trackEvent, helpers])

	return <ToolsContext.Provider value={tools}>{children}</ToolsContext.Provider>
}

/** @public */
export function useTools() {
	const ctx = React.useContext(ToolsContext)

	if (!ctx) {
		throw new Error('useTools must be used within a ToolProvider')
	}

	return ctx
}

/**
 * Options for {@link onDragFromToolbarToCreateShape}.
 * @public
 */
export interface OnDragFromToolbarToCreateShapesOpts {
	/**
	 * Create the shape being dragged. You don't need to worry about positioning it, as it'll be
	 * immediately updated with the correct position.
	 */
	createShape(id: TLShapeId): void
	/**
	 * Called once the drag interaction has finished.
	 */
	onDragEnd?(id: TLShapeId): void
}

/**
 * A helper method to use in {@link TLUiToolItem#onDragStart} to create a shape by dragging it from
 * the toolbar.
 * @public
 */
export function onDragFromToolbarToCreateShape(
	editor: Editor,
	info: TLPointerEventInfo,
	opts: OnDragFromToolbarToCreateShapesOpts
) {
	const { x, y } = editor.inputs.currentPagePoint

	const stoppingPoint = editor.markHistoryStoppingPoint('drag shape tool')
	editor.setCurrentTool('select.translating')

	const id = createShapeId()
	opts.createShape(id)
	const shape = assertExists(editor.getShape(id), 'Shape not found')

	const { w, h } = editor.getShapePageBounds(id)!
	editor.updateShape({ id, type: shape.type, x: x - w / 2, y: y - h / 2 })
	editor.select(id)

	editor.setCurrentTool('select.translating', {
		...info,
		target: 'shape',
		shape: editor.getShape(id),
		isCreating: true,
		creatingMarkId: stoppingPoint,
		onCreate() {
			editor.setCurrentTool('select.idle')
			editor.select(id)
			opts.onDragEnd?.(id)
		},
	})
	editor.getCurrentTool().setCurrentToolIdMask(shape.type)
}
