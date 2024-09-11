import { assertExists } from '@tldraw/utils'
import { createContext, useContext } from 'react'

const ContainerContext = createContext<HTMLElement | null>(null)

/** @internal */
export function ContainerProvider({
	container,
	children,
}: {
	container: HTMLElement
	children: React.ReactNode
}) {
	return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}

/** @public */
export function useContainer(): HTMLElement {
	return assertExists(useContext(ContainerContext), 'useContainer used outside of <Tldraw />')
}

export function useContainerIfExists(): HTMLElement | null {
	return useContext(ContainerContext)
}
