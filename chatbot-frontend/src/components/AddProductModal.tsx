import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import type { ProductRecord } from '../types'

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

const labelClass = 'mb-2 block text-[0.68rem] font-extrabold uppercase tracking-wider text-black'
const inputClass = 'h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 text-sm text-black outline-none transition placeholder:text-calisto-soft focus:border-orange-300 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const fileInputClass = 'block h-11 w-full rounded-xl border border-calisto-line bg-calisto-table px-3 py-1.5 text-sm text-black outline-none transition file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-calisto-surface file:px-3 file:text-xs file:font-semibold file:text-black hover:file:bg-calisto-surface-muted focus:border-orange-300 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const textareaClass = 'min-h-28 w-full resize-y rounded-xl border border-calisto-line bg-calisto-table p-4 text-sm leading-6 text-black outline-none transition placeholder:text-calisto-soft focus:border-orange-300 focus:bg-calisto-surface focus:ring-4 focus:ring-calisto-focus'
const errorClass = 'mt-1 text-xs font-semibold text-rose-600'

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
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const isEditMode = mode === 'edit'

  useEffect(() => {
    if (!open) return
    setFormData(isEditMode && initialData ? createFormFromProduct(initialData) : createDefaultForm(generateProductId()))
    setErrors({})
    setSubmitError(null)
  }, [initialData, isEditMode, open])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 30)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  function updateField<K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSubmitError(null)
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validate() {
    const nextErrors: FormErrors = {}
    const requiredFields: Array<keyof ProductFormData> = [
      'productName',
      'brand',
      'category',
      'productType',
      'price',
    ]

    requiredFields.forEach((field) => {
      if (!String(formData[field] ?? '').trim()) {
        nextErrors[field] = 'This field is required.'
      }
    })

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    try {
      setSubmitError(null)
      await onSave?.(formData)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save product.')
    }
  }

  function handleOverlayMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-calisto-ink/50"
      onMouseDown={handleOverlayMouseDown}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-8 lg:pl-60 lg:pr-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="addProductTitle"
          className="w-full max-w-5xl overflow-hidden rounded-3xl border border-calisto-line bg-calisto-surface text-black shadow-dashboard"
          onMouseDown={(event) => event.stopPropagation()}
        >
        <div className="flex items-start justify-between gap-4 border-b border-calisto-line px-6 py-5">
          <div>
            <h2 id="addProductTitle" className="text-lg font-bold text-black">{isEditMode ? 'Edit Product' : 'Add Product'}</h2>
            <p className="mt-1 text-sm text-black">Capture product metadata for the catalogue.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-calisto-line bg-calisto-surface text-black transition hover:bg-calisto-surface-muted"
            onClick={onClose}
            aria-label="Close add product modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <section className="grid gap-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Identity</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="productId">Product ID</label>
                <input
                  id="productId"
                  className={isEditMode ? `${inputClass} bg-calisto-surface-muted` : inputClass}
                  type="text"
                  value={formData.productId}
                  onChange={(event) => updateField('productId', event.target.value)}
                  placeholder="P0501"
                  readOnly={isEditMode}
                  aria-readonly={isEditMode}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="productName">Product Name *</label>
                <input
                  id="productName"
                  ref={firstFieldRef}
                  className={inputClass}
                  type="text"
                  value={formData.productName}
                  onChange={(event) => updateField('productName', event.target.value)}
                />
                {errors.productName && <p className={errorClass}>{errors.productName}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="brand">Brand *</label>
                <input
                  id="brand"
                  className={inputClass}
                  type="text"
                  value={formData.brand}
                  onChange={(event) => updateField('brand', event.target.value)}
                />
                {errors.brand && <p className={errorClass}>{errors.brand}</p>}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Catalogue</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="category">Category *</label>
                <input
                  id="category"
                  className={inputClass}
                  type="text"
                  value={formData.category}
                  onChange={(event) => updateField('category', event.target.value)}
                />
                {errors.category && <p className={errorClass}>{errors.category}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="productType">Product Type *</label>
                <input
                  id="productType"
                  className={inputClass}
                  type="text"
                  value={formData.productType}
                  onChange={(event) => updateField('productType', event.target.value)}
                />
                {errors.productType && <p className={errorClass}>{errors.productType}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="gender">Gender</label>
                <select
                  id="gender"
                  className={inputClass}
                  value={formData.gender}
                  onChange={(event) => updateField('gender', event.target.value)}
                >
                  <option value="">Select gender</option>
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Unisex">Unisex</option>
                </select>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <label className={labelClass} htmlFor="description">Description</label>
                <textarea
                  id="description"
                  className={textareaClass}
                  value={formData.description}
                  onChange={(event) => updateField('description', event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Pricing &amp; Stock</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="price">Price (MYR) *</label>
                <input
                  id="price"
                  className={inputClass}
                  type="text"
                  value={formData.price}
                  onChange={(event) => updateField('price', event.target.value)}
                />
                {errors.price && <p className={errorClass}>{errors.price}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="stockStatus">Stock Status</label>
                <select
                  id="stockStatus"
                  className={inputClass}
                  value={formData.stockStatus}
                  onChange={(event) => updateField('stockStatus', event.target.value)}
                >
                  <option value="">Select status</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="rating">Rating</label>
                <input
                  id="rating"
                  className={inputClass}
                  type="text"
                  value={formData.rating}
                  onChange={(event) => updateField('rating', event.target.value)}
                  placeholder="4.8"
                />
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Frame</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={labelClass} htmlFor="material">Material</label>
                <input
                  id="material"
                  className={inputClass}
                  type="text"
                  value={formData.material}
                  onChange={(event) => updateField('material', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="shape">Shape</label>
                <input
                  id="shape"
                  className={inputClass}
                  type="text"
                  value={formData.shape}
                  onChange={(event) => updateField('shape', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="color">Color</label>
                <input
                  id="color"
                  className={inputClass}
                  type="text"
                  value={formData.color}
                  onChange={(event) => updateField('color', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="style">Style</label>
                <input
                  id="style"
                  className={inputClass}
                  type="text"
                  value={formData.style}
                  onChange={(event) => updateField('style', event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Lens &amp; Optics</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={labelClass} htmlFor="lensType">Lens Type</label>
                <input
                  id="lensType"
                  className={inputClass}
                  type="text"
                  value={formData.lensType}
                  onChange={(event) => updateField('lensType', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lensColor">Lens Color</label>
                <input
                  id="lensColor"
                  className={inputClass}
                  type="text"
                  value={formData.lensColor}
                  onChange={(event) => updateField('lensColor', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lensFeature">Lens Feature</label>
                <input
                  id="lensFeature"
                  className={inputClass}
                  type="text"
                  value={formData.lensFeature}
                  onChange={(event) => updateField('lensFeature', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lensDuration">Lens Duration</label>
                <input
                  id="lensDuration"
                  className={inputClass}
                  type="text"
                  value={formData.lensDuration}
                  onChange={(event) => updateField('lensDuration', event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="uvProtection">UV Protection</label>
                <select
                  id="uvProtection"
                  className={inputClass}
                  value={booleanSelectValue(formData.uvProtection)}
                  onChange={(event) => updateField('uvProtection', parseBooleanSelect(event.target.value))}
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="polarized">Polarized</label>
                <select
                  id="polarized"
                  className={inputClass}
                  value={booleanSelectValue(formData.polarized)}
                  onChange={(event) => updateField('polarized', parseBooleanSelect(event.target.value))}
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="multifocal">Multifocal</label>
                <select
                  id="multifocal"
                  className={inputClass}
                  value={booleanSelectValue(formData.multifocal)}
                  onChange={(event) => updateField('multifocal', parseBooleanSelect(event.target.value))}
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Location</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="storeLocation">Store Location</label>
                <input
                  id="storeLocation"
                  className={inputClass}
                  type="text"
                  value={formData.storeLocation}
                  onChange={(event) => updateField('storeLocation', event.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="city">City</label>
                <input
                  id="city"
                  className={inputClass}
                  type="text"
                  value={formData.city}
                  onChange={(event) => updateField('city', event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Flags</div>
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-black">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-calisto-line text-calisto-accent focus:ring-2 focus:ring-calisto-focus"
                  checked={formData.bestseller}
                  onChange={(event) => updateField('bestseller', event.target.checked)}
                />
                Bestseller
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-black">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-calisto-line text-calisto-accent focus:ring-2 focus:ring-calisto-focus"
                  checked={formData.newArrival}
                  onChange={(event) => updateField('newArrival', event.target.checked)}
                />
                New Arrival
              </label>
            </div>
          </section>

          <section className="mt-6 grid gap-4 border-t border-calisto-line-subtle pt-6">
            <div className="text-xs font-extrabold uppercase tracking-wider text-black">Image</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="imageFile">Image Upload</label>
                <input
                  id="imageFile"
                  className={fileInputClass}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(event) => updateField('imageFile', event.target.files?.[0] ?? null)}
                />
                <p className="mt-2 text-xs font-semibold text-black">
                  {formData.imageFile ? `Selected: ${formData.imageFile.name}` : 'Accepted: jpg, jpeg, png, webp'}
                </p>
              </div>
              <div>
                <label className={labelClass} htmlFor="imageUrl">Or paste URL</label>
                <input
                  id="imageUrl"
                  className={inputClass}
                  type="text"
                  placeholder="https://... or /static/products/example.jpg"
                  value={formData.imageUrl}
                  onChange={(event) => updateField('imageUrl', event.target.value)}
                />
              </div>
            </div>
          </section>

          {submitError && (
            <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {submitError}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-calisto-line pt-5">
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
