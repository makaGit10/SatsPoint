import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { Pagination } from './Pagination'

function rendre(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>)
}

const nav = () => screen.getByRole('navigation', { name: 'Pages de la liste' })

describe('Pagination', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  })
  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("n'affiche rien quand tout tient sur une page", () => {
    const { container } = rendre(<Pagination page={1} parPage={20} total={12} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le résumé, les numéros compacts avec « … » et marque la page courante', () => {
    rendre(<Pagination page={2} parPage={30} total={248} onChange={() => {}} />)
    const n = nav()
    expect(within(n).getAllByText('31–60 sur 248').length).toBeGreaterThan(0)
    expect(within(n).getByText('Page 2 / 9')).toBeInTheDocument()
    const numeros = within(n).getAllByRole('button', { name: /^Page \d+$/ })
    expect(numeros.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5', '9'])
    expect(within(n).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(within(n).getByRole('button', { name: 'Page 3' })).not.toHaveAttribute('aria-current')
    expect(within(n).getByText('…')).toHaveAttribute('aria-hidden', 'true')
  })

  it('désactive « précédente » sur la première page et « suivante » sur la dernière', () => {
    const { rerender } = rendre(<Pagination page={1} parPage={20} total={45} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeEnabled()
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Pagination page={3} parPage={20} total={45} onChange={() => {}} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled()
    expect(screen.getAllByText('41–45 sur 45').length).toBeGreaterThan(0)
  })

  it('change de page (précédente, suivante, numéro) et ignore la page courante', () => {
    const onChange = vi.fn()
    rendre(<Pagination page={5} parPage={10} total={200} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 20' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }))
    expect(onChange.mock.calls).toEqual([[6], [4], [20]])
  })

  it("remonte en haut de la liste quand elle est sortie de l'écran", () => {
    const ancre = { current: document.createElement('div') }
    ancre.current.getBoundingClientRect = () => ({ top: -400 }) as DOMRect
    rendre(<Pagination page={1} parPage={20} total={60} onChange={() => {}} ancre={ancre} />)
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('ne bouge pas la page si le haut de la liste est déjà visible', () => {
    const ancre = { current: document.createElement('div') }
    ancre.current.getBoundingClientRect = () => ({ top: 200 }) as DOMRect
    rendre(<Pagination page={1} parPage={20} total={60} onChange={() => {}} ancre={ancre} />)
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('sans total : « Page N » et suivante selon `suivante`', () => {
    const onChange = vi.fn()
    rendre(<Pagination page={2} parPage={10} suivante={false} onChange={onChange} />)
    expect(screen.getAllByText('Page 2').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Page \d+$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Page suivante' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('accepte un libellé de navigation propre à la liste', () => {
    rendre(<Pagination page={1} parPage={20} total={50} onChange={() => {}} libelle="Pages des ventes" />)
    expect(screen.getByRole('navigation', { name: 'Pages des ventes' })).toBeInTheDocument()
  })

  it('est traduite en anglais', async () => {
    await i18n.changeLanguage('en')
    rendre(<Pagination page={2} parPage={30} total={248} onChange={() => {}} />)
    const n = screen.getByRole('navigation', { name: 'List pages' })
    expect(within(n).getAllByText('31–60 of 248').length).toBeGreaterThan(0)
    expect(within(n).getByText('Page 2 of 9')).toBeInTheDocument()
    expect(within(n).getByRole('button', { name: 'Next page' })).toBeInTheDocument()
  })
})
