import { StateNode } from '@tldraw/editor'
import { Creating } from './toolStates/Creating'
import { Idle } from './toolStates/Idle'
import { Pointing } from './toolStates/Pointing'

/** @public */
export class NoteShapeTool extends StateNode {
	static override id = 'note'
	static override initial = 'idle'
	static override children = () => [Idle, Pointing, Creating]
	override shapeType = 'note'
}
