export type ProductStatus = 'available' | 'preorder' | 'out_of_stock' | 'archived'

export interface ProductMedia {
  id: string
  product_section: 'honey' | 'apiary' | 'beekeeper' | 'flowers'
  product_id: string
  media_type: 'image' | 'video' | 'youtube'
  url: string
  alt: string | null
  position: number
  is_primary: boolean
  created_at: string
}

export interface SiteSettings {
  id: number
  phone: string | null
  phone_secondary: string | null
  address_full: string | null
  address_display: string | null
  telegram_url: string | null
  youtube_url: string | null
  featured_youtube_video_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  tiktok_url: string | null
  hero_tagline: string | null
  hero_subtext: string | null
  updated_at: string
}

export interface HoneyProduct {
  id: string
  name: string
  slug: string
  variety: string
  description: string | null
  short_description: string | null
  full_description: string | null
  aroma_notes: string | null
  taste_notes: string | null
  color_note: string | null
  crystallization_note: string | null
  recommended_use: string | null
  packaging: string[] | null
  packaging_note: string | null
  price_plastic_uah: number | null
  price_glass_uah: number | null
  status: ProductStatus
  is_featured: boolean
  display_order: number
  image_url: string | null
  image_alt: string | null
  gallery_images?: string[] | null
  youtube_video_link: string | null
  youtube_video_urls?: string[] | null
  video_url?: string | null
  media?: ProductMedia[]
  created_at?: string
  updated_at?: string
}

export interface ApiaryProduct {
  id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  full_description: string | null
  composition: string | null
  usage_notes: string | null
  storage_info: string | null
  packaging_note: string | null
  weight_g: number | null
  price_uah: number | null
  status: ProductStatus
  is_featured: boolean
  gallery_images: string[] | null
  packaging: string[] | null
  display_order: number
  image_url: string | null
  image_alt: string | null
  youtube_video_url: string | null
  youtube_video_urls?: string[] | null
  video_url?: string | null
  media?: ProductMedia[]
  created_at?: string
  updated_at?: string
}

export interface BeekeeperProduct {
  id: string
  name: string
  slug: string
  product_type: 'bee_packages' | 'bee_colonies' | 'empty_hives' | 'hives_with_bees' | 'apiary_supply'
  description: string | null
  full_description: string | null
  breeds: string[] | null
  season_note: string | null
  price_uah: number | null
  price_note: string | null
  status: ProductStatus
  is_featured: boolean
  image_url: string | null
  image_alt: string | null
  gallery_images?: string[] | null
  youtube_video_url: string | null
  youtube_video_urls?: string[] | null
  video_url?: string | null
  display_order: number
  media?: ProductMedia[]
  created_at?: string
  updated_at?: string
}

export interface Review {
  id: string
  reviewer_name: string
  city: string
  quote: string
  rating: number
  is_visible: boolean
  photo_url?: string | null
  created_at?: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
  category: 'products' | 'ordering' | 'delivery' | 'beekeeping'
  display_order: number
  created_at?: string
}

export interface Inquiry {
  id: string
  name: string
  phone: string
  product: string | null
  message: string | null
  source: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface FlowerProduct {
  id: string
  name: string
  slug: string
  category: string
  variety: string | null
  short_description: string | null
  full_description: string | null
  price_uah: number | null
  color: string | null
  bloom_season: string | null
  height_cm: number | null
  lighting: string | null
  packaging_note: string | null
  display_order: number
  status: ProductStatus
  is_featured: boolean
  image_url: string | null
  image_alt: string | null
  gallery_images?: string[] | null
  youtube_video_url: string | null
  youtube_video_urls?: string[] | null
  video_url?: string | null
  media?: ProductMedia[]
  created_at?: string
  updated_at?: string
}

export interface Service {
  id: string
  name: string
  slug: string
  short_description: string | null
  description: string | null
  price_uah: number | null
  price_note: string | null
  duration_note: string | null
  status: 'active' | 'inactive'
  is_featured: boolean
  display_order: number
  image_url: string | null
  // Booking fields (added in migration 042)
  booking_type: 'hourly' | 'daily' | null
  capacity: number | null
  extra_guest_price_uah: number | null
  slot_start_hour: number | null
  slot_end_hour: number | null
  check_in_time: string | null
  check_out_time: string | null
  created_at?: string
  updated_at?: string
}

// ─── Dropshipping / Supplier layer ────────────────────────────────────────
// Completely separate from dacha-tv own catalog (honey, apiary, beekeeper, flowers, services).

export interface SupplierCategory {
  id: string
  supplier_id: string
  name: string
  name_ua: string | null
  slug: string | null
  parent_supplier_id: string | null
  is_approved: boolean
  display_order: number
  raw_data?: Record<string, unknown> | null
  synced_at: string
  created_at: string
}

export interface SupplierProduct {
  id: string
  supplier_sku: string
  supplier_category_id: string | null
  name: string
  name_ua: string | null
  slug: string | null
  description: string | null
  description_ua: string | null
  short_description_ua: string | null
  price_uah: number | null
  our_price_uah: number | null
  stock_quantity: number
  is_in_stock: boolean
  main_image_url: string | null
  images: string[] | null
  attributes: Record<string, unknown> | null
  weight_kg: number | null
  is_approved: boolean
  is_published: boolean
  publish_priority: number
  meta_title: string | null
  meta_description: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type CatalogProductStatus = 'published' | 'draft' | 'archived'

export type CatalogSource = 'supplier' | 'manual'
export type ManualLeadType = 'natural_products' | 'metal'

export interface CatalogCategory {
  id: string
  supplier_category_id: string | null
  slug: string
  name_ua: string
  description: string | null
  meta_title: string | null
  meta_description: string | null
  image_url: string | null
  is_published: boolean
  display_order: number
  // Manual catalog layer (migration 051)
  source?: CatalogSource
  lead_type?: ManualLeadType | null
  // Ordering + SEO (migration 054)
  sort_order?: number
  seo_title?: string | null
  seo_description?: string | null
  description_ua?: string | null
  h1?: string | null
  faq_json?: unknown
  seo_keywords?: string | null
  seo_status?: string
  seo_source?: string
  seo_generated_at?: string | null
  seo_manual_lock?: boolean
  created_at: string
  updated_at: string
}

export interface CatalogProduct {
  id: string
  supplier_product_id: string | null
  supplier_sku: string | null
  name_ua: string
  slug: string
  category_slug: string | null
  short_description: string | null
  description: string | null
  price_uah: number | null
  compare_price_uah: number | null
  main_image_url: string | null
  images: string[] | null
  attributes: Record<string, unknown> | null
  status: CatalogProductStatus
  is_featured: boolean
  is_price_suspicious: boolean
  display_order: number
  meta_title: string | null
  meta_description: string | null
  // Manual catalog layer (migration 051)
  source?: CatalogSource
  price_prefix?: string | null
  unit_label?: string | null
  inquiry_only?: boolean
  lead_type?: ManualLeadType | null
  options?: Record<string, unknown> | null
  // SEO system (migration 054)
  description_ua?: string | null
  seo_keywords?: string | null
  seo_status?: string
  seo_source?: string
  seo_generated_at?: string | null
  seo_manual_lock?: boolean
  // Per-field manual ownership locks (migration 20260720). When true, the
  // supplier import must not overwrite the corresponding storefront field.
  price_manual_lock?: boolean
  image_manual_lock?: boolean
  // Public storefront stock, synced from supplier_products by the import
  // (migration 20260720 v4). Manual/metal rows are never given supplier stock.
  stock_quantity?: number | null
  is_in_stock?: boolean | null
  stock_synced_at?: string | null
  created_at: string
  updated_at: string
}

export interface SupplierSyncLog {
  id: string
  sync_type: string
  status: 'running' | 'completed' | 'failed' | 'stale'
  products_total: number
  products_new: number
  products_updated: number
  products_errors: number
  categories_total: number
  error_details: Record<string, unknown> | null
  triggered_by: string | null
  started_at: string
  completed_at: string | null
}

// Legacy type aliases kept for backward compatibility with admin components and inquiry actions
export type InquiryStatus = 'new' | 'contacted' | 'completed' | 'cancelled'
export type InquiryType =
  | 'honey_order'
  | 'beekeeper_inquiry'
  | 'general'
  | 'flower_inquiry'
  | 'lavender_booking'
  | 'water_house_booking'
  | 'natural_products'
  | 'metal'

export interface InquiryData {
  type: InquiryType
  name: string
  phone: string
  product?: string
  packaging?: string
  breed?: string
  quantity?: string
  timing?: string
  message?: string
  source?: string
  // Optional routing context for n8n / Telegram (product leads). When present
  // these are forwarded to the webhook so the workflow can route without relying
  // solely on environment variables.
  category?: string
  product_slug?: string
  product_title?: string
  options?: Record<string, unknown> | null
  // Booking extras (lavender) — rendered into the Telegram message when present.
  total_price_uah?: number
  duration_hours?: number
  extra_guests?: number
  extra_guests_price?: number
  bouquet_qty?: number
  bouquet_unit_price?: number
  // Preformatted booking lines (server builds these once for Telegram + webhook).
  guests_text?: string
  bouquet_line?: string
}

// ─── Store core — Orders ───────────────────────────────────────────────────

export type OrderStatus = 'new' | 'confirmed' | 'packed' | 'shipped' | 'completed' | 'cancelled'
export type ProductType = 'catalog' | 'apiary' | 'flower' | 'honey' | 'custom'

export interface OrderItem {
  id: string
  order_id: string
  product_type: ProductType
  product_id: string | null
  product_slug: string
  product_name: string
  unit_price_uah: number
  quantity: number
  subtotal_uah: number
  variant: string | null
}

export interface Order {
  id: string
  created_at: string
  customer_name: string
  phone: string
  comment: string | null
  delivery_notes: string | null
  status: OrderStatus
  total_uah: number
  source: string | null
  order_source: 'website' | 'admin'
  admin_notes: string | null
  // Supplier order forwarding fields (set when catalog items forwarded to dropship API)
  receiver_first_name: string | null
  receiver_last_name: string | null
  receiver_patronymic: string | null
  method_payment: string | null
  nova_poshta_warehouse_id: string | null
  nova_poshta_warehouse_name: string | null
  supplier_order_id: string | null
  supplier_order_mode: string | null
  supplier_order_status: string | null
  supplier_order_response: Record<string, unknown> | null
  items?: OrderItem[]
}
