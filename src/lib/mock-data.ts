import { Project, Asset, Plan, Metric, AdminUser, Payment, StudioElement, Layer, User } from "@/types"

export const mockUser: User = {
  id: "usr_1",
  name: "Alex Silva",
  email: "alex@example.com",
  avatar: "",
  plan: "pro",
}

export const mockProjects: Project[] = [
  { id: "proj_1", name: "Cartão João Construtor", type: "cartao", status: "publicado", thumbnail: "", views: 1247, createdAt: "2026-05-15", updatedAt: "2026-05-20" },
  { id: "proj_2", name: "Panfleto Imobiliário", type: "panfleto", status: "rascunho", thumbnail: "", views: 0, createdAt: "2026-05-18", updatedAt: "2026-05-18" },
  { id: "proj_3", name: "Post Restaurante", type: "post", status: "publicado", thumbnail: "", views: 892, createdAt: "2026-05-10", updatedAt: "2026-05-19" },
  { id: "proj_4", name: "Cartão Dra. Mariana", type: "cartao", status: "pausado", thumbnail: "", views: 345, createdAt: "2026-04-28", updatedAt: "2026-05-12" },
  { id: "proj_5", name: "Panfleto Tech Summit", type: "panfleto", status: "rascunho", thumbnail: "", views: 0, createdAt: "2026-05-22", updatedAt: "2026-05-22" },
  { id: "proj_6", name: "Post Lançamento", type: "post", status: "rascunho", thumbnail: "", views: 0, createdAt: "2026-05-25", updatedAt: "2026-05-25" },
]

export const mockMetrics: Metric[] = [
  { label: "Projetos Criados", value: "6", change: "+2 esse mês", icon: "folder" },
  { label: "Visualizações AR", value: "2.484", change: "+18% vs mês passado", icon: "eye" },
  { label: "Assets Usados", value: "23", change: "+5 essa semana", icon: "box" },
  { label: "Plano Atual", value: "Pro", change: "25 projetos · 5GB", icon: "crown" },
]

export const mockAssets: Asset[] = [
  { id: "ast_1", name: "Cadeira Moderna", category: "3d", size: "2.4 MB", url: "#", createdAt: "2026-05-10" },
  { id: "ast_2", name: "Logo Animado", category: "video", size: "8.1 MB", url: "#", createdAt: "2026-05-12" },
  { id: "ast_3", name: "Fundo Escritório", category: "image", size: "1.2 MB", url: "#", createdAt: "2026-05-14" },
  { id: "ast_4", name: "Produto 3D", category: "3d", size: "5.7 MB", url: "#", createdAt: "2026-05-16" },
  { id: "ast_5", name: "Vídeo Promocional", category: "video", size: "15.3 MB", url: "#", createdAt: "2026-05-18" },
  { id: "ast_6", name: "Mockup Cartão", category: "image", size: "0.8 MB", url: "#", createdAt: "2026-05-20" },
]

export const mockPlans: Plan[] = [
  { id: "starter", name: "Starter", price: "R$ 49", projectsLimit: 3, assetsLimit: "500 MB", features: ["3 projetos ativos", "500MB de assets", "Modelos 3D básicos", "Vídeos MP4", "QR Code", "Marca d'água AR Business"] },
  { id: "pro", name: "Pro", price: "R$ 97", projectsLimit: 25, assetsLimit: "5 GB", features: ["25 projetos ativos", "5GB de assets", "Modelos 3D animados", "Vídeos MP4 + Chromakey", "Botões interativos", "QR Code personalizado", "Sem marca d'água", "Suporte prioritário"] },
  { id: "agency", name: "Agency", price: "R$ 197", projectsLimit: "ilimitado", assetsLimit: "50 GB", features: ["Projetos ilimitados", "50GB de assets", "Todos os recursos Pro", "Múltiplos usuários", "API de integração", "Domínio próprio", "Analytics avançado", "Suporte 24h"] },
]

export const mockAdminUsers: AdminUser[] = [
  { id: "usr_1", name: "Alex Silva", email: "alex@example.com", plan: "pro", projects: 12, createdAt: "2026-01-15", status: "ativo" },
  { id: "usr_2", name: "Maria Santos", email: "maria@exemplo.com", plan: "agency", projects: 45, createdAt: "2026-02-20", status: "ativo" },
  { id: "usr_3", name: "João Pereira", email: "joao@exemplo.com", plan: "starter", projects: 2, createdAt: "2026-03-10", status: "ativo" },
  { id: "usr_4", name: "Ana Costa", email: "ana@exemplo.com", plan: "pro", projects: 8, createdAt: "2026-04-05", status: "inativo" },
  { id: "usr_5", name: "Carlos Oliveira", email: "carlos@exemplo.com", plan: "starter", projects: 3, createdAt: "2026-05-01", status: "ativo" },
]

export const mockPayments: Payment[] = [
  { id: "pay_1", user: "Alex Silva", plan: "pro", amount: "R$ 97,00", date: "2026-05-01", status: "aprovado" },
  { id: "pay_2", user: "Maria Santos", plan: "agency", amount: "R$ 197,00", date: "2026-05-01", status: "aprovado" },
  { id: "pay_3", user: "João Pereira", plan: "starter", amount: "R$ 49,00", date: "2026-05-02", status: "aprovado" },
  { id: "pay_4", user: "Ana Costa", plan: "pro", amount: "R$ 97,00", date: "2026-04-28", status: "aprovado" },
  { id: "pay_5", user: "Carlos Oliveira", plan: "starter", amount: "R$ 49,00", date: "2026-05-05", status: "pendente" },
  { id: "pay_6", user: "Roberto Lima", plan: "pro", amount: "R$ 97,00", date: "2026-04-15", status: "recusado" },
]

export const SAMPLE_VIDEO_URL = "/mp4-default.mp4"
export const SAMPLE_CHROMAKEY_URL = "/chormakey-default.mp4"

export const mockElements: StudioElement[] = [
  { id: "el_1", type: "modelo-3d", name: "Sofa Model", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], opacity: 1, duration: 0, visible: true, animationType: "float" },
  { id: "el_2", type: "botao-whatsapp", name: "WhatsApp", position: [2, 1, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], opacity: 1, duration: 0, visible: true, action: "https://wa.me/5511999999999", showCaption: true },
  { id: "el_3", type: "video-mp4", name: "Vídeo Intro", position: [-2, 0.5, 0], rotation: [0, 0, 0], scale: [1.5, 0.85, 0.1], opacity: 0.9, duration: 5, visible: true, assetUrl: SAMPLE_VIDEO_URL },
  { id: "el_4", type: "video-chromakey", name: "Vídeo Chroma", position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1.2, 0.7, 0.1], opacity: 1, duration: 5, visible: true, chromaKeyColor: "#00ff00", chromaKeyTolerance: 0.15, chromaKeySmoothness: 0.1, assetUrl: SAMPLE_CHROMAKEY_URL },
]

export const mockLayers: Layer[] = [
  { id: "el_1", name: "Sofa Model", type: "modelo-3d", visible: true, locked: false, order: 0 },
  { id: "el_2", name: "WhatsApp", type: "botao-whatsapp", visible: true, locked: false, order: 1 },
  { id: "el_3", name: "Vídeo Intro", type: "video-mp4", visible: true, locked: false, order: 2 },
  { id: "el_4", name: "Vídeo Chroma", type: "video-chromakey", visible: true, locked: false, order: 3 },
]

export const faqItems = [
  { q: "O que é CortexAR?", a: "É uma plataforma SaaS que permite criar experiências de realidade aumentada para materiais impressos como cartões de visita, panfletos e posts. Sem precisar de programação." },
  { q: "Como funciona o marcador de imagem?", a: "Você faz upload de uma imagem (como seu cartão de visita). Nosso sistema gera um marcador que, quando escaneado pelo celular, dispara a experiência AR." },
  { q: "Preciso de aplicativo para visualizar?", a: "Não! A experiência roda direto no navegador do celular via WebAR. Basta apontar a câmera para o marcador." },
  { q: "Quais formatos de mídia são suportados?", a: "Modelos 3D (GLB/GLTF), vídeos MP4, vídeos com chromakey, imagens PNG/JPG e botões interativos (WhatsApp, site, Instagram, ligação, e-mail)." },
  { q: "Posso usar meu próprio domínio?", a: "Sim! Nos planos Pro e Agency você pode usar domínio próprio para as experiências AR." },
  { q: "Como funciona o período de teste?", a: "Oferecemos 7 dias grátis no plano Pro. Sem compromisso, sem cartão de crédito." },
]
