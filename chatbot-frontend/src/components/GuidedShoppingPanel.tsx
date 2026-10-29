import { ArrowLeft, CircleDot, Glasses, RotateCcw, Search, Sparkles, Sun } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import type { BudgetOption, GuidedCategory } from '../lib/guided-shopping'
import { budgetOptions, guidedCategories } from '../lib/guided-shopping'

export type GuidedStep = 'welcome' | 'budget' | 'preferences' | 'closed'

interface GuidedShoppingPanelProps {
  brands: string[]
  category?: GuidedCategory
  budget?: BudgetOption
  disabled?: boolean
  loadingBrands?: boolean
  selectedBrand?: string
  selectedInStock?: boolean
  onBack: () => void
  onCategory: (category: GuidedCategory) => void
  onChooseBudget: (budget: BudgetOption) => void
  onExplore: () => void
  onReset: () => void
  onSearch: (options: { brand?: string; inStock?: boolean }) => void
  step: GuidedStep
}

const categoryIcons = [Sun, Glasses, CircleDot]

function OptionButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`min-h-11 rounded-xl border border-calisto-line bg-calisto-surface px-3 py-2.5 text-left text-sm font-semibold text-calisto-ink transition hover:border-calisto-accent/45 hover:bg-calisto-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40 disabled:cursor-not-allowed disabled:opacity-55 ${className}`} type="button" {...props}>{children}</button>
}

export default function GuidedShoppingPanel({
  brands, category, budget, disabled = false, loadingBrands = false, selectedBrand, selectedInStock, onBack, onCategory, onChooseBudget, onExplore, onReset, onSearch, step,
}: GuidedShoppingPanelProps) {
  if (step === 'closed') return null

  if (step === 'welcome') {
    return (
      <section aria-label="Guided product discovery" className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center rounded-2xl border border-calisto-line bg-calisto-surface p-5 shadow-sm sm:p-7">
        <div className="mx-auto mb-6 max-w-xl text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-calisto-accent/10 text-calisto-accent"><Sparkles className="h-5 w-5" /></span>
          <h3 className="text-2xl font-bold tracking-tight text-calisto-ink">Welcome to Calisto</h3>
          <p className="mt-2 text-sm leading-6 text-calisto-muted">What can I help you find today? Choose a category or ask in your own words.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {guidedCategories.map((item, index) => {
            const Icon = item.kind === 'category' ? categoryIcons[index] : Search
            return <OptionButton aria-label={item.label} disabled={disabled} key={item.label} onClick={() => item.kind === 'category' ? onCategory(item) : onExplore()} className="group min-h-28 p-4">
              <Icon aria-hidden="true" className="mb-4 h-5 w-5 text-calisto-accent" />
              <span className="block">{item.label}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-calisto-muted">{item.description}</span>
            </OptionButton>
          })}
        </div>
      </section>
    )
  }

  if (step === 'budget') {
    return (
      <section aria-label="Choose budget" className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center rounded-2xl border border-calisto-line bg-calisto-surface p-5 shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-wider text-calisto-muted">Step 2 of 3 · {category?.label}</p>
        <h3 className="mt-2 text-xl font-bold text-calisto-ink">What is your budget?</h3>
        <p className="mt-1 text-sm text-calisto-muted">Every price range is sent as a real catalogue filter.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {budgetOptions.map((item) => <OptionButton disabled={disabled} key={item.label} onClick={() => onChooseBudget(item)}>{item.label}</OptionButton>)}
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><OptionButton disabled={disabled} onClick={onBack} className="inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Back</OptionButton><OptionButton disabled={disabled} onClick={onReset} className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" />Start over</OptionButton></div>
      </section>
    )
  }

  return (
    <section aria-label="Choose preferences" className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center rounded-2xl border border-calisto-line bg-calisto-surface p-5 shadow-sm sm:p-7">
      <p className="text-xs font-bold uppercase tracking-wider text-calisto-muted">Step 3 of 3 · {category?.label} · {budget?.label}</p>
      <h3 className="mt-2 text-xl font-bold text-calisto-ink">Any preferences?</h3>
      <p className="mt-1 text-sm text-calisto-muted">Pick availability or a catalogue brand, or continue without either.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <OptionButton aria-pressed={selectedInStock === true} className={selectedInStock === true ? 'border-calisto-accent bg-calisto-accent/10' : ''} disabled={disabled} onClick={() => onSearch({ inStock: true })}>Available now{selectedInStock === true ? ' · selected' : ''}</OptionButton>
        <OptionButton disabled={disabled} onClick={() => onSearch({})}>Skip preferences{selectedInStock === undefined && !selectedBrand ? ' · selected' : ''}</OptionButton>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-calisto-muted">Brand {loadingBrands ? '· loading catalogue…' : ''}</p>
        {brands.length > 0 ? <div className="flex flex-wrap gap-2">{brands.map((brand) => <OptionButton aria-pressed={selectedBrand === brand} className={`!min-h-10 !rounded-full !px-3.5 !py-2 ${selectedBrand === brand ? 'border-calisto-accent bg-calisto-accent/10' : ''}`} disabled={disabled} key={brand} onClick={() => onSearch({ brand, inStock: true })}>{brand} · available now{selectedBrand === brand ? ' · selected' : ''}</OptionButton>)}</div> : !loadingBrands && <p className="text-sm text-calisto-muted">Brand filters are unavailable right now. You can still search by category and budget.</p>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2"><OptionButton disabled={disabled} onClick={onBack} className="inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Change budget</OptionButton><OptionButton disabled={disabled} onClick={onReset} className="inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" />Start over</OptionButton></div>
    </section>
  )
}
