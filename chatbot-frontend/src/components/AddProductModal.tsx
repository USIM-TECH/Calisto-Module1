import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ImageIcon, Trash2, UploadCloud } from 'lucide-react'
import Button from './Button'
import Modal from './Modal'
import RequiredMark from './RequiredMark'
import Select from './Select'
import { getPresets, getProductPresetIds, resolveAssetUrl } from '../api/client'
import type { PresetRecord, ProductRecord } from '../types'

export interface ProductFormData {
  productId: string
  productName: string
  brand: string

  category: string
  productType: string
  gender: string
  description: string

  price: string
  stockStatus: string
  rating: string

  material: string
  shape: string
  color: string
  style: string

  lensType: string
  lensColor: string
  lensFeature: string
  lensDuration: string

  uvProtection: boolean | null
  polarized: boolean | null
  multifocal: boolean | null

  storeLocation: string
  city: string

  bestseller: boolean
  newArrival: boolean

  presetIds: string[]

  imageFile: File | null
  imageUrl: string
}

interface AddProductModalProps {
  open: boolean
  onClose: () => void
  onSave?: (data: ProductFormData) => Promise<void> | void
  initialData?: ProductRecord | null
  mode?: 'create' | 'edit'
  saving?: boolean
}

type FormErrors = Partial<Record<keyof ProductFormData, string>>

const YES_NO_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

const inputBase = 'h-11 w-full rounded-lg border bg-calisto-surface px-3 text-sm text-calisto-ink outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/60 focus:ring-4 focus:ring-calisto-focus'
const inputClass = `${inputBase} border-calisto-line`
const inputErrorClass = `${inputBase} border-rose-400`
const textareaClass = 'min-h-24 w-full resize-y rounded-lg border border-calisto-line bg-calisto-surface px-3 py-2.5 text-sm leading-6 text-calisto-ink outline-none transition placeholder:text-calisto-soft focus:border-calisto-accent/60 focus:ring-4 focus:ring-calisto-focus'

/** Left: section title + one-line explanation. Right: the fields (stacks on small screens). */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-b border-calisto-line-subtle py-6 first:pt-1 last:border-b-0 last:pb-1 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-semibold text-calisto-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-calisto-muted">{description}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  className = '',
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-calisto-ink" htmlFor={htmlFor}>
        {label}
        {required && <RequiredMark />}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-calisto-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** On/off switch with a short explanation (Material/iOS style). */
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-calisto-line px-4 py-3 transition hover:bg-calisto-surface-muted">
      <span>
        <span className="block text-sm font-medium text-calisto-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-calisto-muted">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input checked={checked} className="peer sr-only" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span className="h-5 w-9 rounded-full bg-calisto-line transition peer-checked:bg-calisto-accent peer-focus-visible:ring-4 peer-focus-visible:ring-calisto-focus" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
      </span>
    </label>
  )
}

const REQUIRED_LABELS: Partial<Record<keyof ProductFormData, string>> = {
  productName: 'Product name',
  brand: 'Brand',
  category: 'Category',
  productType: 'Product type',
  price: 'Price',
}

/** All current problems with the form, whether or not the user has visited the field yet. */
function getProductErrors(form: ProductFormData): FormErrors {
  const errors: FormErrors = {}
  for (const [field, label] of Object.entries(REQUIRED_LABELS) as Array<[keyof ProductFormData, string]>) {
    if (!String(form[field] ?? '').trim()) errors[field] = `${label} is required.`
  }
  const price = form.price.trim()
  if (price && !(/^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0)) {
    errors.price = 'Enter a valid price above 0, e.g. 299.00.'
  }
  const rating = form.rating.trim()
  if (rating && !(/^\d+(\.\d+)?$/.test(rating) && Number(rating) >= 0 && Number(rating) <= 5)) {
    errors.rating = 'Rating must be a number from 0 to 5.'
  }
  return errors
}

function generateProductId() {
  const digits = Math.floor(1000 + Math.random() * 9000)
  return `P${digits}`
}

function createDefaultForm(productId: string): ProductFormData {
  return {
    productId,
    productName: '',
    brand: '',
    category: '',
    productType: '',
    gender: '',
    description: '',
    price: '',
    stockStatus: '',
    rating: '',
    material: '',
    shape: '',
    color: '',
    style: '',
    lensType: '',
    lensColor: '',
    lensFeature: '',
    lensDuration: '',
    uvProtection: null,
    polarized: null,
    multifocal: null,
    storeLocation: '',
    city: '',
    bestseller: false,
    newArrival: false,
    presetIds: [],
    imageFile: null,
    imageUrl: '',
  }
}

function parseNullableBoolean(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (['true', 'yes', '1', 'on'].includes(normalized)) return true
  if (['false', 'no', '0', 'off'].includes(normalized)) return false
  return null
}

function createFormFromProduct(product: ProductRecord): ProductFormData {
  return {
    productId: product.productId,
    productName: product.productName ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    productType: product.productType ?? '',
    gender: product.gender ?? '',
    description: product.description ?? '',
    price: Number.isFinite(product.priceMyr) ? String(product.priceMyr) : '',
    stockStatus: product.stockStatus ?? '',
    rating: product.rating !== null && product.rating !== undefined ? String(product.rating) : '',
    material: product.frameMaterial ?? '',
    shape: product.frameShape ?? '',
    color: product.frameColor ?? '',
    style: product.frameStyle ?? '',
    lensType: product.lensType ?? '',
    lensColor: product.lensColor ?? '',
    lensFeature: product.lensFeature ?? '',
    lensDuration: product.lensDuration ?? '',
    uvProtection: parseNullableBoolean(product.uvProtection),
    polarized: parseNullableBoolean(product.polarized),
    multifocal: parseNullableBoolean(product.multifocal),
    storeLocation: product.storeLocation ?? '',
    city: product.city ?? '',
    bestseller: product.bestseller ?? false,
    newArrival: product.newArrival ?? false,
    presetIds: [],
    imageFile: null,
    imageUrl: product.imageUrl ?? '',
  }
}

function booleanSelectValue(value: boolean | null) {
  if (value === null) return ''
  return value ? 'yes' : 'no'
}

function parseBooleanSelect(value: string) {
  if (value === '') return null
  return value === 'yes'
}

export default function AddProductModal({
  open,
  onClose,
  onSave,
  initialData = null,
  mode = 'create',
  saving = false,
}: AddProductModalProps) {
  const [formData, setFormData] = useState<ProductFormData>(() => createDefaultForm(generateProductId()))
  // Fields the user has left at least once; their errors are shown from then on.
  const [touched, setTouched] = useState<Partial<Record<keyof ProductFormData, boolean>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [presets, setPresets] = useState<PresetRecord[]>([])
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const isEditMode = mode === 'edit'

  useEffect(() => {
    if (!open) return
    setFormData(isEditMode && initialData ? createFormFromProduct(initialData) : createDefaultForm(generateProductId()))
    setTouched({})
    setSubmitError(null)
  }, [initialData, isEditMode, open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void getPresets()
      .then((result) => {
        if (!cancelled) setPresets(result.items)
      })
      .catch(() => {
        if (!cancelled) setPresets([])
      })

    if (isEditMode && initialData) {
      void getProductPresetIds(initialData.productId)
        .then((result) => {
          if (!cancelled) {
            setFormData((prev) => ({ ...prev, presetIds: result.presetIds }))
          }
        })
        .catch(() => undefined)
    }

    return () => {
      cancelled = true
    }
  }, [initialData, isEditMode, open])

  function togglePreset(presetId: string) {
    setFormData((prev) => ({
      ...prev,
      presetIds: prev.presetIds.includes(presetId)
        ? prev.presetIds.filter((id) => id !== presetId)
        : [...prev.presetIds, presetId],
    }))
    setSubmitError(null)
  }

  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 30)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  // Preview for the chosen file (object URL) or the pasted image URL.
  useEffect(() => {
    if (!formData.imageFile) {
      setFilePreview(null)
      return
    }
    const url = URL.createObjectURL(formData.imageFile)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [formData.imageFile])

  const allErrors = getProductErrors(formData)
  const isValid = Object.keys(allErrors).length === 0
  const errors: FormErrors = Object.fromEntries(
    Object.entries(allErrors).filter(([field]) => touched[field as keyof ProductFormData]),
  )

  function updateField<K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSubmitError(null)
  }

  function touch(field: keyof ProductFormData) {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!isValid) {
      setTouched(Object.fromEntries(Object.keys(allErrors).map((key) => [key, true])))
      return
    }
    try {
      setSubmitError(null)
      await onSave?.(formData)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save product.')
    }
  }

  if (!open) return null

  const imagePreview = filePreview ?? resolveAssetUrl(formData.imageUrl.trim() || undefined)

  function pickImage(file: File | undefined) {
    if (file && /^image\/(jpeg|png|webp)$/.test(file.type)) updateField('imageFile', file)
  }

  return (
    <Modal
      description={isEditMode ? `Update the details of ${formData.productName || formData.productId}.` : 'Add a new item to the product catalogue.'}
      dismissible={!saving}
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !isValid}>
            {saving ? 'Saving...' : isEditMode ? 'Save changes' : 'Add product'}
          </Button>
        </>
      )}
      onClose={onClose}
      onSubmit={handleSave}
      size="2xl"
      title={isEditMode ? 'Edit product' : 'Add product'}
    >
      {submitError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
          {submitError}
        </div>
      )}

      <Section title="Basic information" description="How the product is named and described to customers.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" htmlFor="productName" required error={errors.productName}>
            <input
              id="productName"
              ref={firstFieldRef}
              className={errors.productName ? inputErrorClass : inputClass}
              type="text"
              value={formData.productName}
              onChange={(event) => updateField('productName', event.target.value)}
              onBlur={() => touch('productName')}
              placeholder="e.g. Aviator Classic"
            />
          </Field>
          <Field label="Brand" htmlFor="brand" required error={errors.brand}>
            <input
              id="brand"
              className={errors.brand ? inputErrorClass : inputClass}
              type="text"
              value={formData.brand}
              onChange={(event) => updateField('brand', event.target.value)}
              onBlur={() => touch('brand')}
              placeholder="e.g. Ray-Ban"
            />
          </Field>
        </div>
        <Field
          label="Product ID"
          htmlFor="productId"
          hint={isEditMode ? 'The ID can\'t be changed after the product is created.' : 'Generated automatically. You can replace it with your own SKU.'}
          className="sm:max-w-[calc(50%-0.5rem)]"
        >
          <input
            id="productId"
            className={isEditMode ? `${inputClass} bg-calisto-surface-muted text-calisto-muted` : inputClass}
            type="text"
            value={formData.productId}
            onChange={(event) => updateField('productId', event.target.value)}
            placeholder="P0501"
            readOnly={isEditMode}
            aria-readonly={isEditMode}
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            className={textareaClass}
            value={formData.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Short description shown to customers"
          />
        </Field>
      </Section>

      <Section title="Category" description="Used for filtering and by the chatbot when it recommends products.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category" required error={errors.category}>
            <input
              id="category"
              className={errors.category ? inputErrorClass : inputClass}
              type="text"
              value={formData.category}
              onChange={(event) => updateField('category', event.target.value)}
              onBlur={() => touch('category')}
              placeholder="e.g. Eyewear"
            />
          </Field>
          <Field label="Product type" htmlFor="productType" required error={errors.productType}>
            <input
              id="productType"
              className={errors.productType ? inputErrorClass : inputClass}
              type="text"
              value={formData.productType}
              onChange={(event) => updateField('productType', event.target.value)}
              onBlur={() => touch('productType')}
              placeholder="e.g. Sunglasses"
            />
          </Field>
          <Field label="Gender" htmlFor="gender">
            <Select
              fullWidth
              id="gender"
              onChange={(value) => updateField('gender', value)}
              options={[{ value: 'Men', label: 'Men' }, { value: 'Women', label: 'Women' }, { value: 'Unisex', label: 'Unisex' }]}
              placeholder="Select gender"
              value={formData.gender}
            />
          </Field>
        </div>
      </Section>

      <Section title="Pricing & inventory" description="Selling price, stock availability and customer rating.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price" htmlFor="price" required error={errors.price}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-calisto-muted">RM</span>
              <input
                id="price"
                className={`${errors.price ? inputErrorClass : inputClass} pl-11 tabular-nums`}
                inputMode="decimal"
                type="text"
                value={formData.price}
                onChange={(event) => updateField('price', event.target.value)}
                onBlur={() => touch('price')}
                placeholder="0.00"
              />
            </div>
          </Field>
          <Field label="Stock status" htmlFor="stockStatus">
            <Select
              fullWidth
              id="stockStatus"
              onChange={(value) => updateField('stockStatus', value)}
              options={[
                { value: 'in_stock', label: 'In Stock' },
                { value: 'low_stock', label: 'Low Stock' },
                { value: 'out_of_stock', label: 'Out of Stock' },
              ]}
              placeholder="Select status"
              value={formData.stockStatus}
            />
          </Field>
          <Field label="Rating" htmlFor="rating" error={errors.rating}>
            <div className="relative">
              <input
                id="rating"
                className={`${errors.rating ? inputErrorClass : inputClass} pr-10 tabular-nums`}
                inputMode="decimal"
                type="text"
                value={formData.rating}
                onChange={(event) => updateField('rating', event.target.value)}
                onBlur={() => touch('rating')}
                placeholder="4.8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-calisto-muted">/ 5</span>
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Media" description="Main product photo. JPG, PNG or WebP.">
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-calisto-line bg-calisto-surface-muted">
            {imagePreview ? (
              <img alt="Product preview" className="h-full w-full object-cover" src={imagePreview} />
            ) : (
              <ImageIcon aria-hidden="true" className="h-8 w-8 text-calisto-soft" strokeWidth={1.5} />
            )}
          </div>
          <div className="grid gap-3">
            <div
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition ${
                dragging ? 'border-calisto-accent bg-calisto-accent/5' : 'border-calisto-line hover:border-calisto-soft hover:bg-calisto-surface-muted'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pickImage(event.dataTransfer.files?.[0])
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              role="button"
              tabIndex={0}
            >
              <UploadCloud aria-hidden="true" className="h-6 w-6 text-calisto-muted" strokeWidth={1.6} />
              {formData.imageFile ? (
                <span className="text-sm font-medium text-calisto-ink">{formData.imageFile.name}</span>
              ) : (
                <span className="text-sm text-calisto-body">
                  <span className="font-semibold text-calisto-accent">Click to upload</span> or drag and drop
                </span>
              )}
              <span className="text-xs text-calisto-muted">JPG, PNG or WebP</span>
              <input
                id="imageFile"
                ref={fileInputRef}
                accept=".jpg,.jpeg,.png,.webp"
                className="sr-only"
                onChange={(event) => pickImage(event.target.files?.[0] ?? undefined)}
                type="file"
              />
            </div>
            {formData.imageFile && (
              <button
                className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
                onClick={() => {
                  updateField('imageFile', null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove file
              </button>
            )}
            <Field label="Or image URL" htmlFor="imageUrl">
              <input
                id="imageUrl"
                className={inputClass}
                type="text"
                placeholder="https://... or /static/products/example.jpg"
                value={formData.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Frame details" description="Physical attributes of the frame.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Material" htmlFor="material">
            <input id="material" className={inputClass} type="text" value={formData.material} onChange={(event) => updateField('material', event.target.value)} placeholder="e.g. Acetate" />
          </Field>
          <Field label="Shape" htmlFor="shape">
            <input id="shape" className={inputClass} type="text" value={formData.shape} onChange={(event) => updateField('shape', event.target.value)} placeholder="e.g. Round" />
          </Field>
          <Field label="Color" htmlFor="color">
            <input id="color" className={inputClass} type="text" value={formData.color} onChange={(event) => updateField('color', event.target.value)} placeholder="e.g. Tortoise" />
          </Field>
          <Field label="Style" htmlFor="style">
            <input id="style" className={inputClass} type="text" value={formData.style} onChange={(event) => updateField('style', event.target.value)} placeholder="e.g. Classic" />
          </Field>
        </div>
      </Section>

      <Section title="Lens & optics" description="Lens properties and protection features.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lens type" htmlFor="lensType">
            <input id="lensType" className={inputClass} type="text" value={formData.lensType} onChange={(event) => updateField('lensType', event.target.value)} />
          </Field>
          <Field label="Lens color" htmlFor="lensColor">
            <input id="lensColor" className={inputClass} type="text" value={formData.lensColor} onChange={(event) => updateField('lensColor', event.target.value)} />
          </Field>
          <Field label="Lens feature" htmlFor="lensFeature">
            <input id="lensFeature" className={inputClass} type="text" value={formData.lensFeature} onChange={(event) => updateField('lensFeature', event.target.value)} />
          </Field>
          <Field label="Lens duration" htmlFor="lensDuration">
            <input id="lensDuration" className={inputClass} type="text" value={formData.lensDuration} onChange={(event) => updateField('lensDuration', event.target.value)} placeholder="e.g. Monthly" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="UV protection" htmlFor="uvProtection">
            <Select fullWidth id="uvProtection" onChange={(value) => updateField('uvProtection', parseBooleanSelect(value))} options={YES_NO_OPTIONS} placeholder="Not set" value={booleanSelectValue(formData.uvProtection)} />
          </Field>
          <Field label="Polarized" htmlFor="polarized">
            <Select fullWidth id="polarized" onChange={(value) => updateField('polarized', parseBooleanSelect(value))} options={YES_NO_OPTIONS} placeholder="Not set" value={booleanSelectValue(formData.polarized)} />
          </Field>
          <Field label="Multifocal" htmlFor="multifocal">
            <Select fullWidth id="multifocal" onChange={(value) => updateField('multifocal', parseBooleanSelect(value))} options={YES_NO_OPTIONS} placeholder="Not set" value={booleanSelectValue(formData.multifocal)} />
          </Field>
        </div>
      </Section>

      <Section title="Store availability" description="Where customers can find this product in person.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store location" htmlFor="storeLocation">
            <input id="storeLocation" className={inputClass} type="text" value={formData.storeLocation} onChange={(event) => updateField('storeLocation', event.target.value)} placeholder="e.g. Mid Valley Megamall" />
          </Field>
          <Field label="City" htmlFor="city">
            <input id="city" className={inputClass} type="text" value={formData.city} onChange={(event) => updateField('city', event.target.value)} placeholder="e.g. Kuala Lumpur" />
          </Field>
        </div>
      </Section>

      <Section title="Merchandising" description="Highlights and the presets the chatbot can recommend this product from.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={formData.bestseller}
            description="Show a Bestseller badge"
            label="Bestseller"
            onChange={(checked) => updateField('bestseller', checked)}
          />
          <Toggle
            checked={formData.newArrival}
            description="Show a New badge"
            label="New arrival"
            onChange={(checked) => updateField('newArrival', checked)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium text-calisto-ink">Presets</div>
          {presets.length === 0 ? (
            <p className="text-sm text-calisto-muted">No presets yet. Create them on the Presets page.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => {
                const checked = formData.presetIds.includes(preset.id)
                return (
                  <label
                    key={preset.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-calisto-focus ${
                      checked
                        ? 'border-calisto-accent bg-calisto-accent/10 text-calisto-accent'
                        : 'border-calisto-line text-calisto-body hover:bg-calisto-surface-muted'
                    }`}
                  >
                    <input checked={checked} className="sr-only" onChange={() => togglePreset(preset.id)} type="checkbox" />
                    {checked && <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    {preset.name}
                  </label>
                )
              })}
            </div>
          )}
          <p className="mt-1.5 text-xs text-calisto-muted">The active preset (Presets page) decides what the chatbot suggests.</p>
        </div>
      </Section>
    </Modal>
  )
}

