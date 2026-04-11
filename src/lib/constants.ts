/**
 * 主形象的 appearanceIndex 值。
 * 所有判断主/子形象的逻辑必须引用此常量，禁止硬编码数字。
 * 子形象的 appearanceIndex 从 PRIMARY_APPEARANCE_INDEX + 1 开始递增。
 */
export const PRIMARY_APPEARANCE_INDEX = 0

// 比例配置（nanobanana 支持的所有比例，按常用程度排序）
export const ASPECT_RATIO_CONFIGS: Record<string, { label: string; isVertical: boolean }> = {
  '16:9': { label: '16:9', isVertical: false },
  '9:16': { label: '9:16', isVertical: true },
  '1:1': { label: '1:1', isVertical: false },
  '3:2': { label: '3:2', isVertical: false },
  '2:3': { label: '2:3', isVertical: true },
  '4:3': { label: '4:3', isVertical: false },
  '3:4': { label: '3:4', isVertical: true },
  '5:4': { label: '5:4', isVertical: false },
  '4:5': { label: '4:5', isVertical: true },
  '21:9': { label: '21:9', isVertical: false },
}

// 配置页面使用的选项列表（从 ASPECT_RATIO_CONFIGS 派生）
export const VIDEO_RATIOS = Object.entries(ASPECT_RATIO_CONFIGS).map(([value, config]) => ({
  value,
  label: config.label
}))

// 获取比例配置
export function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['16:9']
}

export const ANALYSIS_MODELS = [
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' }
]

export const IMAGE_MODELS = [
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' }
]

// 图像模型选项（ 生成完整图片）
export const IMAGE_MODEL_OPTIONS = [
  { value: 'banana', label: 'Banana Pro (FAL)' },
  { value: 'banana-2', label: 'Banana 2 (FAL)' },
  { value: 'gemini-3-pro-image-preview', label: 'Banana (Google)' },
  { value: 'gemini-3-pro-image-preview-batch', label: 'Banana (Google Batch) 省50%' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' },
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 (Google)' },
  { value: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra' },
  { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' }
]

// Banana 模型分辨率选项（仅用于九宫格分镜图，单张生成固定2K）
export const BANANA_RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K (推荐，快速)' },
  { value: '4K', label: '4K (高清，较慢)' }
]

// 支持分辨率选择的 Banana 模型
export const BANANA_MODELS = ['banana', 'banana-2', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-batch']

export const VIDEO_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015-batch', label: 'Seedance 1.0 Pro Fast (批量) 省50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (批量) 省50%' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (批量) 省50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (批量) 省50%' },
  { value: 'fal-wan25', label: 'Wan 2.6' },
  { value: 'fal-veo31', label: 'Veo 3.1 Fast' },
  { value: 'fal-sora2', label: 'Sora 2' },
  { value: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling 2.5 Turbo Pro' },
  { value: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3 Standard' },
  { value: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3 Pro' }
]

// SeeDream 批量模型列表（使用 GPU 空闲时间，成本降低50%）
export const SEEDANCE_BATCH_MODELS = [
  'doubao-seedance-1-5-pro-251215-batch',
  'doubao-seedance-1-0-pro-250528-batch',
  'doubao-seedance-1-0-pro-fast-251015-batch',
  'doubao-seedance-1-0-lite-i2v-250428-batch',
]

// 支持生成音频的模型
export const AUDIO_SUPPORTED_MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-1-5-pro-251215-batch',
]

// 首尾帧视频模型（能力权威来源是 standards/capabilities；此常量仅作静态兜底展示）
export const FIRST_LAST_FRAME_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0 (首尾帧)' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast (首尾帧)' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro (首尾帧)' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (首尾帧/批量) 省50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro (首尾帧)' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (首尾帧/批量) 省50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite (首尾帧)' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (首尾帧/批量) 省50%' },
  { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 (首尾帧)' },
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (首尾帧)' }
]

export const VIDEO_RESOLUTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }
]

export const TTS_RATES = [
  { value: '+0%', label: '正常速度 (1.0x)' },
  { value: '+20%', label: '轻微加速 (1.2x)' },
  { value: '+50%', label: '加速 (1.5x)' },
  { value: '+100%', label: '快速 (2.0x)' }
]

export const TTS_VOICES = [
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声)', preview: '女' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声)', preview: '女' }
]

export type ArtStyleValue =
  | 'american-comic'
  | 'shaw-brothers'
  | 'hk-wuxia-90s'
  | 'anime-80s-handdrawn'
  | 'wuxia-2000s-cg'
  | 'chinese-xianxia'
  | 'chinese-comic'
  | 'japanese-anime'
  | 'japanese-cel'
  | 'cinematic-anime'
  | 'cyberpunk-anime'
  | 'dark-fantasy'
  | 'chibi-comedy'
  | 'realistic'

export const ART_STYLES: Array<{
  value: ArtStyleValue
  label: string
  preview: string
  promptZh: string
  promptEn: string
}> = [
  // 兼容保留旧值：american-comic 继续可用，但语义修正为西式漫画/动画分镜感，避免再误导到日漫。
  {
    value: 'american-comic',
    label: '美式漫画风',
    preview: '美',
    promptZh: '美式漫画与西式动画分镜风格，夸张清晰的轮廓线，强烈光影对比，鲜明配色，动态感强，干净高完成度插画画面。',
    promptEn: 'American comic and western animated storyboard style, bold contour lines, strong contrast lighting, vivid colors, dynamic composition, polished illustration finish.'
  },
  {
    value: 'shaw-brothers',
    label: '邵氏武侠片',
    preview: '邵',
    promptZh: '邵氏老电影武侠美术风格，棚拍戏曲感布景，艳丽复古色彩，强舞台灯光，经典港产武侠电影构图，戏剧化动作定格。',
    promptEn: 'Shaw Brothers wuxia cinema style, studio-built theatrical sets, vivid retro colors, dramatic stage lighting, classic Hong Kong martial-arts framing, frozen operatic action.'
  },
  {
    value: 'hk-wuxia-90s',
    label: '90年代港式武侠',
    preview: '港',
    promptZh: '90年代港式武侠电影风格，潇洒江湖气，强运动感镜头，烟雾与逆光，侠客对决氛围，复古胶片质感。',
    promptEn: '1990s Hong Kong wuxia film style, free-spirited jianghu mood, energetic camera language, mist and backlight, duel-ready heroes, retro film texture.'
  },
  {
    value: 'anime-80s-handdrawn',
    label: '80年代手绘动画',
    preview: '80',
    promptZh: '80年代手绘动画风格，手工赛璐璐上色，复古柔和颗粒感，朴素背景绘制，经典电视动画与剧场版气质。',
    promptEn: '1980s hand-drawn animation style, hand-painted cel coloring, soft retro grain, painted backgrounds, classic TV-anime and theatrical mood.'
  },
  {
    value: 'wuxia-2000s-cg',
    label: '00年代武侠CG',
    preview: '00',
    promptZh: '2000年代武侠奇幻CG风格，华丽能量特效，飘逸服装与发丝，强烈纵深透视，电视剧海报级仙侠武侠画面。',
    promptEn: '2000s wuxia-fantasy CG style, ornate energy effects, flowing costumes and hair, dramatic depth perspective, TV-poster-grade heroic fantasy imagery.'
  },
  {
    value: 'chinese-xianxia',
    label: '国风仙侠',
    preview: '仙',
    promptZh: '中国仙侠风格，云雾灵气，古典山水意境，飘逸法袍与法器，清透发光效果，唯美东方幻想画面。',
    promptEn: 'Chinese xianxia fantasy style, spiritual mist, classical landscape atmosphere, flowing robes and artifacts, luminous translucent effects, elegant eastern fantasy visuals.'
  },
  {
    value: 'chinese-comic',
    label: '精致国漫',
    preview: '国',
    promptZh: '高品质国漫叙事插画风格，角色设计鲜明，镜头感强，细节密度高，线条利落干净，光影通透，画面精致统一，成熟2D动画概念图质感。',
    promptEn: 'Premium Chinese comic narrative illustration style, distinctive character design, cinematic framing, dense refined details, crisp clean line art, luminous lighting, cohesive polished 2D animation concept-art quality.'
  },
  {
    value: 'japanese-anime',
    label: '日系动漫风',
    preview: '日',
    promptZh: '现代日系动漫风格，赛璐璐上色，清晰干净的线条，视觉小说CG感。高质量2D风格',
    promptEn: 'Modern Japanese anime style, cel shading, clean line art, visual-novel CG look, high-quality 2D style.'
  },
  {
    value: 'japanese-cel',
    label: '经典日式赛璐璐',
    preview: '璐',
    promptZh: '经典日式赛璐璐动画风格，分层阴影明确，手绘背景，色块简洁稳定，昭和到平成早期动画气质。',
    promptEn: 'Classic Japanese cel animation style, distinct layered shadows, hand-painted backgrounds, stable simple color blocks, Showa to early Heisei anime mood.'
  },
  {
    value: 'cinematic-anime',
    label: '电影感动画',
    preview: '映',
    promptZh: '电影感动画风格，镜头叙事强，光影层次丰富，景深与构图讲究，角色保持二次元表现，整体有高规格动画电影气质。',
    promptEn: 'Cinematic anime style, strong visual storytelling, rich lighting layers, deliberate depth and composition, stylized 2D characters with high-end animated film presence.'
  },
  {
    value: 'cyberpunk-anime',
    label: '赛博朋克动画',
    preview: '赛',
    promptZh: '赛博朋克动画风格，霓虹都市夜景，高密度电子视觉元素，冷暖对比光，未来街景与角色造型强烈，画面锐利。',
    promptEn: 'Cyberpunk anime style, neon city nights, dense electronic visual motifs, contrasting cool and warm lights, striking futuristic streets and character styling, sharp image finish.'
  },
  {
    value: 'dark-fantasy',
    label: '黑暗奇幻',
    preview: '暗',
    promptZh: '黑暗奇幻风格，低饱和厚重氛围，古老遗迹与异界感，戏剧性阴影，神秘压迫感强，史诗幻想插画质感。',
    promptEn: 'Dark fantasy style, low-saturation weighty atmosphere, ancient ruins and otherworldly mood, dramatic shadows, oppressive mystery, epic fantasy illustration texture.'
  },
  {
    value: 'chibi-comedy',
    label: 'Q版喜剧',
    preview: 'Q',
    promptZh: 'Q版喜剧动画风格，大头小身比例，夸张表情与肢体动作，色彩明快，节奏轻松，适合幽默搞笑演出。',
    promptEn: 'Chibi comedy animation style, oversized heads and small bodies, exaggerated expressions and gestures, bright colors, light rhythm, ideal for humorous staging.'
  },
  {
    value: 'pixar-3d',
    label: '皮克斯3D风',
    preview: '3D',
    promptZh: '皮克斯/迪士尼级别3D动画渲染风格，人物造型圆润可爱但细节极度精致（皮肤次表面散射光感、毛发每根可见、布料物理模拟褶皱），眼睛超大且层次丰富（瞳孔虹膜纹理+多层高光反射），面部表情肌肉张力自然夸张兼备，场景灯光温暖柔和（全局光照+环境光遮蔽），材质质感逼真（木头纹理、金属反光、陶瓷光泽），景深虚化自然，色彩明亮饱满但不刺眼，整体画面有电影级3D动画的温暖厚重感，Pixar RenderMan渲染质感。',
    promptEn: 'Pixar / Disney-level 3D animation rendering style, rounded and charming character designs with hyper-detailed surface quality (subsurface scattering skin luminosity, individual visible hair strands, physically simulated fabric folds), oversized expressive eyes with rich layering (iris texture detail, multi-layer specular reflections), facial expressions balancing naturalistic muscle movement with appealing exaggeration, warm soft scene lighting (global illumination, ambient occlusion), tactile material rendering (wood grain, metallic sheen, ceramic gloss), natural cinematic depth-of-field, bright and saturated yet non-harsh color palette, overall warmth and weight of a feature-length 3D animated film, Pixar RenderMan render quality.'
  },
  {
    value: 'realistic',
    label: '电影写实',
    preview: '实',
    promptZh: '电影级写实风格，真实人物与场景质感，可信材质细节，镜头语言自然，光线准确，色彩克制高级，整体干净细腻且具有影视剧照感。',
    promptEn: 'Cinematic realism style, lifelike people and environments, believable material detail, natural camera language, accurate lighting, restrained premium color grading, clean refined frame with film-still quality.'
  }
]

const ART_STYLE_VALUE_SET = new Set<string>(ART_STYLES.map((style) => style.value))

export function isArtStyleValue(value: unknown): value is ArtStyleValue {
  return typeof value === 'string' && ART_STYLE_VALUE_SET.has(value)
}

/**
 * 🔥 实时从 ART_STYLES 常量获取风格 prompt
 * 这是获取风格 prompt 的唯一正确方式，确保始终使用最新的常量定义
 * 
 * @param artStyle - 风格标识符，如 'realistic', 'american-comic' 等
 * @returns 对应的风格 prompt，如果找不到则返回空字符串
 */
export function getArtStylePrompt(
  artStyle: string | null | undefined,
  locale: 'zh' | 'en',
): string {
  if (!artStyle) return ''
  const style = ART_STYLES.find(s => s.value === artStyle)
  if (!style) return ''
  return locale === 'en' ? style.promptEn : style.promptZh
}

// 角色形象生成的系统后缀（始终添加到提示词末尾，不显示给用户）- 左侧面部特写+右侧三视图
export const CHARACTER_PROMPT_SUFFIX = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写（如果是人类则展示完整正脸，如果是动物/生物则展示最具辨识度的正面形态）；【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。纯白色背景，无其他元素。'

// 道具图片生成的系统后缀（固定白底三视图资产图）
export const PROP_PROMPT_SUFFIX = '道具设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是道具主体的主视图特写；【右侧区域】占约2/3宽度，是同一道具的三视图横向排列（从左到右依次为：正面、侧面、背面），三视图高度一致。纯白色背景，主体居中完整展示，无人物、无手部、无桌面陈设、无环境背景、无其他元素。'

// 场景图片生成的系统后缀（已禁用四视图，直接生成单张场景图）
export const LOCATION_PROMPT_SUFFIX = ''

// 角色资产图生成比例（当前角色设定图实际使用 3:2）
export const CHARACTER_ASSET_IMAGE_RATIO = '3:2'
// 历史保留：旧注释中曾写 16:9，但当前资产图生成统一以 CHARACTER_ASSET_IMAGE_RATIO 为准
export const CHARACTER_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO
// 角色图片尺寸（用于Seedream API）
export const CHARACTER_IMAGE_SIZE = '3840x2160'  // 16:9 横版
// 角色图片尺寸（用于Banana API）
export const CHARACTER_IMAGE_BANANA_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 道具图片生成比例（与角色资产图保持一致）
export const PROP_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 场景图片生成比例（1:1 正方形单张场景）
export const LOCATION_IMAGE_RATIO = '1:1'
// 场景图片尺寸（用于Seedream API）- 4K
export const LOCATION_IMAGE_SIZE = '4096x4096'  // 1:1 正方形 4K
// 场景图片尺寸（用于Banana API）
export const LOCATION_IMAGE_BANANA_RATIO = '1:1'

// 从提示词中移除角色系统后缀（用于显示给用户）
export function removeCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(CHARACTER_PROMPT_SUFFIX, '').trim()
}

// 添加角色系统后缀到提示词（用于生成图片）
export function addCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return CHARACTER_PROMPT_SUFFIX
  const cleanPrompt = removeCharacterPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${CHARACTER_PROMPT_SUFFIX}`
}

export function removePropPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(PROP_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

export function addPropPromptSuffix(prompt: string): string {
  if (!prompt) return PROP_PROMPT_SUFFIX
  const cleanPrompt = removePropPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${PROP_PROMPT_SUFFIX}`
}

// 从提示词中移除场景系统后缀（用于显示给用户）
export function removeLocationPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(LOCATION_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

// 添加场景系统后缀到提示词（用于生成图片）
export function addLocationPromptSuffix(prompt: string): string {
  // 后缀为空时直接返回原提示词
  if (!LOCATION_PROMPT_SUFFIX) return prompt || ''
  if (!prompt) return LOCATION_PROMPT_SUFFIX
  const cleanPrompt = removeLocationPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${LOCATION_PROMPT_SUFFIX}`
}

/**
 * 构建角色介绍字符串（用于发送给 AI，帮助理解"我"和称呼对应的角色）
 * @param characters - 角色列表，需要包含 name 和 introduction 字段
 * @returns 格式化的角色介绍字符串
 */
export function buildCharactersIntroduction(characters: Array<{ name: string; introduction?: string | null }>): string {
  if (!characters || characters.length === 0) return '暂无角色介绍'

  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}：${c.introduction}`)

  if (introductions.length === 0) return '暂无角色介绍'

  return introductions.join('\n')
}
