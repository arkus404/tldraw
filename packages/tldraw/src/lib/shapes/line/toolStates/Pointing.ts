import {
	IndexKey,
	Mat,
	StateNode,
	TLEventHandlers,
	TLInterruptEvent,
	TLLineShape,
	TLLineShapeHandle,
	TLShapeId,
	Vec,
	createShapeId,
	getIndexAbove,
	last,
	sortByIndex,
	structuredClone,
} from '@tldraw/editor'

const MINIMUM_DISTANCE_BETWEEN_SHIFT_CLICKED_HANDLES = 2

export class Pointing extends StateNode {
	static override id = 'pointing'

	shape = {} as TLLineShape

	markId: string | undefined

	override onEnter = (info: { shapeId?: TLShapeId }) => {
		const { inputs } = this.editor
		const { currentPagePoint } = inputs

		this.markId = undefined

		// Previously created line shape that we might be extending
		const shape = info.shapeId && this.editor.getShape<TLLineShape>(info.shapeId)

		if (shape && inputs.shiftKey) {
			// Extending a previous shape
			this.markId = `creating:${shape.id}`
			this.editor.mark(this.markId)
			this.shape = shape

			const handles = this.editor.getShapeHandles(this.shape)
			if (!handles) return

			const vertexHandles = handles.filter((h) => h.type === 'vertex').sort(sortByIndex)
			const endHandle = vertexHandles[vertexHandles.length - 1]
			const prevEndHandle = vertexHandles[vertexHandles.length - 2]

			const shapePagePoint = Mat.applyToPoint(
				this.editor.getShapeParentTransform(this.shape)!,
				new Vec(this.shape.x, this.shape.y)
			)

			let nextEndHandleIndex: IndexKey, nextEndHandleId: string, nextEndHandle: TLLineShapeHandle

			const nextPoint = Vec.Sub(currentPagePoint, shapePagePoint)

			if (
				Vec.Dist(endHandle, prevEndHandle) < MINIMUM_DISTANCE_BETWEEN_SHIFT_CLICKED_HANDLES ||
				Vec.Dist(nextPoint, endHandle) < MINIMUM_DISTANCE_BETWEEN_SHIFT_CLICKED_HANDLES
			) {
				// If the end handle is too close to the previous end handle, we'll just extend the previous end handle
				nextEndHandleIndex = endHandle.index
				nextEndHandleId = endHandle.id
				nextEndHandle = {
					index: endHandle.index,
					x: nextPoint.x + 0.1,
					y: nextPoint.y + 0.1,
				}
			} else {
				// Otherwise, we'll create a new end handle
				nextEndHandleIndex = getIndexAbove(endHandle.index)
				nextEndHandleId = 'handle:' + nextEndHandleIndex
				nextEndHandle = {
					index: nextEndHandleIndex,
					x: nextPoint.x + 0.1,
					y: nextPoint.y + 0.1,
				}
			}

			const nextHandles = structuredClone(this.shape.props.handles)

			nextHandles[nextEndHandleId] = nextEndHandle

			this.editor.updateShapes([
				{
					id: this.shape.id,
					type: this.shape.type,
					props: {
						handles: nextHandles,
					},
				},
			])
		} else {
			const id = createShapeId()

			this.markId = `creating:${id}`
			this.editor.mark(this.markId)

			this.editor.createShapes<TLLineShape>([
				{
					id,
					type: 'line',
					x: currentPagePoint.x,
					y: currentPagePoint.y,
				},
			])

			this.editor.select(id)
			this.shape = this.editor.getShape(id)!
		}
	}

	override onPointerMove: TLEventHandlers['onPointerMove'] = () => {
		if (!this.shape) return

		if (this.editor.inputs.isDragging) {
			const handles = this.editor.getShapeHandles(this.shape)
			console
			if (!handles) {
				if (this.markId) this.editor.bailToMark(this.markId)
				throw Error('No handles found')
			}
			const lastHandle = last(handles)!
			this.editor.setCurrentTool('select.dragging_handle', {
				shape: this.shape,
				isCreating: true,
				// remove the offset that we added to the handle when we created it
				handle: { ...lastHandle, x: lastHandle.x - 0.1, y: lastHandle.y - 0.1 },
				onInteractionEnd: 'line',
			})
		}
	}

	override onPointerUp: TLEventHandlers['onPointerUp'] = () => {
		this.complete()
	}

	override onCancel: TLEventHandlers['onCancel'] = () => {
		this.cancel()
	}

	override onComplete: TLEventHandlers['onComplete'] = () => {
		this.complete()
	}

	override onInterrupt: TLInterruptEvent = () => {
		this.parent.transition('idle')
		if (this.markId) this.editor.bailToMark(this.markId)
		this.editor.snaps.clearIndicators()
	}

	complete() {
		this.parent.transition('idle', { shapeId: this.shape.id })
		this.editor.snaps.clearIndicators()
	}

	cancel() {
		if (this.markId) this.editor.bailToMark(this.markId)
		this.parent.transition('idle', { shapeId: this.shape.id })
		this.editor.snaps.clearIndicators()
	}
}
