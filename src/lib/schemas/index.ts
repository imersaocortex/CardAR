import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
})

export const signupSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  phone: z.string().min(10, "Mínimo 10 dígitos").max(20, "Máximo 20 caracteres"),
})

export const createProjectSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  type: z.enum(["business_card", "flyer_a4", "square_1x1"]),
  marker_image: z.string().optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["business_card", "flyer_a4", "square_1x1"]).optional(),
  status: z.enum(["draft", "published", "paused", "archived"]).optional(),
  marker_image_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
})

export const createAssetSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  category: z.enum(["3d", "video", "image"]),
})

export const sceneObjectSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  name: z.string(),
  position_x: z.number().default(0),
  position_y: z.number().default(0),
  position_z: z.number().default(0),
  rotation_x: z.number().default(0),
  rotation_y: z.number().default(0),
  rotation_z: z.number().default(0),
  scale_x: z.number().default(1),
  scale_y: z.number().default(1),
  scale_z: z.number().default(1),
  opacity: z.number().default(1),
  visible: z.boolean().default(true),
  layer_order: z.number().default(0),
  animation_type: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  asset_url: z.string().nullable().optional(),
  asset_thumbnail: z.string().nullable().optional(),
  show_caption: z.boolean().nullable().optional(),
  chroma_key_color: z.string().nullable().optional(),
  chroma_key_tolerance: z.number().nullable().optional(),
  chroma_key_smoothness: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
})

export const sceneSchema = z.object({
  name: z.string().default("Cena Principal"),
  background_color: z.string().default("#000000"),
  lighting_config: z.any().default(() => ({})),
  camera_config: z.any().default(() => ({})),
})

export const systemSettingsSchema = z.object({
  branding: z.object({
    site_name: z.string().min(1).max(100).optional(),
    logo_url: z.string().nullable().optional(),
    favicon_url: z.string().nullable().optional(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
    secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
    og_image_url: z.string().nullable().optional(),
    footer_text: z.string().max(200).nullable().optional(),
    meta_title: z.string().max(200).nullable().optional(),
    meta_description: z.string().max(500).nullable().optional(),
  }).optional(),
  asaas: z.object({
    environment: z.enum(["debug", "sandbox", "production"]).optional(),
    api_key: z.string().optional(),
    webhook_secret: z.string().optional(),
  }).passthrough().optional(),
  general: z.object({
    allow_signups: z.boolean().optional(),
    maintenance_mode: z.boolean().optional(),
    maintenance_message: z.string().max(500).nullable().optional(),
    default_plan_id: z.string().uuid().nullable().optional(),
    trial_days: z.number().int().min(0).max(365).optional(),
  }).optional(),
  evolution: z.object({
    enabled: z.boolean().optional(),
    server_url: z.string().optional(),
    api_key: z.string().optional(),
    instance_name: z.string().optional(),
  }).passthrough().optional(),
  stripe: z.object({
    environment: z.enum(["debug", "production"]).optional(),
  }).passthrough().optional(),
})

export const createPlanSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  price: z.number().int().min(0, "Preço deve ser >= 0"),
  projects_limit: z.number().int().min(0, "Limite deve ser >= 0"),
  assets_limit_bytes: z.number().int().min(0),
  assets_limit_label: z.string().min(1).max(20),
  features: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  billing_cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  trial_days: z.number().int().min(0).default(0),
  has_watermark: z.boolean().default(true),
  allowed_media_types: z.array(z.string()).default(["image/png", "image/jpeg", "model/gltf-binary"]),
  highlight: z.boolean().default(false),
  stripe_price_id: z.string().nullable().optional(),
})

export const updatePlanSchema = createPlanSchema.partial()

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  cpf_cnpj: z.string().max(20).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  address_number: z.string().max(20).nullable().optional(),
  address_complement: z.string().max(100).nullable().optional(),
  address_neighborhood: z.string().max(100).nullable().optional(),
  address_city: z.string().max(100).nullable().optional(),
  address_state: z.string().max(2).nullable().optional(),
  address_zipcode: z.string().max(10).nullable().optional(),
})

export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number(),
    dueDate: z.string(),
    paidDate: z.string().nullable().optional(),
    invoiceUrl: z.string().nullable().optional(),
    subscription: z.string().nullable().optional(),
    customer: z.string(),
  }).optional(),
  subscription: z.object({
    id: z.string(),
    status: z.string(),
    customer: z.string(),
  }).optional(),
})
