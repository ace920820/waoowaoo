import { Shot, VideoMetadata } from '../types';
import { frameToTimecode } from './timecode';

// Helper to generate elegant keyframe SVG thumbnails as DataURLs
export function generateKeyframeSvg(
  shotNum: number,
  frameType: '首帧' | '中间帧' | '尾帧',
  timecode: string,
  colorScheme: 'cyan' | 'purple' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'blue'
): string {
  const gradients = {
    cyan: ['#0f172a', '#0891b2', '#06b6d4', '#164e63'],
    purple: ['#1e1b4b', '#7c3aed', '#a855f7', '#312e81'],
    amber: ['#271c10', '#d97706', '#f59e0b', '#451a03'],
    emerald: ['#022c22', '#059669', '#10b981', '#064e3b'],
    rose: ['#31121d', '#e11d48', '#f43f5e', '#4c0519'],
    indigo: ['#1e1b4b', '#4f46e5', '#6366f1', '#312e81'],
    blue: ['#172554', '#2563eb', '#3b82f6', '#1e3a8a'],
  };

  const g = gradients[colorScheme] || gradients.blue;
  const labelText = `Shot ${String(shotNum).padStart(2, '0')} - ${frameType}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${g[0]}" />
        <stop offset="50%" stop-color="${g[1]}" />
        <stop offset="100%" stop-color="${g[3]}" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${g[2]}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${g[1]}" stop-opacity="0.2" />
      </linearGradient>
    </defs>
    <!-- Background -->
    <rect width="640" height="360" fill="url(#bg)" />
    <!-- Grid Overlay -->
    <path d="M0 90 H640 M0 180 H640 M0 270 H640 M160 0 V360 M320 0 V360 M480 0 V360" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
    
    <!-- Abstract Scene Graphic -->
    <circle cx="${frameType === '首帧' ? 180 : frameType === '中间帧' ? 320 : 460}" cy="180" r="90" fill="${g[2]}" fill-opacity="0.35" />
    <polygon points="120,280 320,120 520,280" fill="url(#glow)" />
    <circle cx="320" cy="140" r="28" fill="#ffffff" fill-opacity="0.8" />

    <!-- Top Badge -->
    <rect x="24" y="20" width="130" height="32" rx="6" fill="#000000" fill-opacity="0.6" stroke="${g[2]}" stroke-width="1"/>
    <text x="89" y="41" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="600" text-anchor="middle">${labelText}</text>

    <!-- Bottom Timecode Overlay -->
    <rect x="24" y="308" width="160" height="32" rx="6" fill="#000000" fill-opacity="0.75" />
    <text x="36" y="329" fill="#38bdf8" font-family="monospace" font-size="14" font-weight="700">⏱ ${timecode}</text>

    <!-- Viewfinder Crosshairs -->
    <path d="M 20 40 L 40 40 M 20 40 L 20 60" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" fill="none"/>
    <path d="M 620 40 L 600 40 M 620 40 L 620 60" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" fill="none"/>
    <path d="M 20 320 L 40 320 M 20 320 L 20 300" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" fill="none"/>
    <path d="M 620 320 L 600 320 M 620 320 L 620 300" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" fill="none"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface SampleVideoPreset {
  id: string;
  name: string;
  description: string;
  metadata: VideoMetadata;
  shots: Shot[];
}

const FPS = 30;

export const SAMPLE_VIDEOS: SampleVideoPreset[] = [
  {
    id: 'nature_documentary',
    name: '示例：4K自然风光宣传片 (01:15)',
    description: '包含大景别山脉、森林晨雾特写、航拍河流与动物追踪，镜头类型丰富。',
    metadata: {
      name: 'Nature_4K_Showreel_2026.mp4',
      size: 48500000,
      duration: 75.0, // 75s
      fps: FPS,
      width: 3840,
      height: 2160,
      url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      totalFrames: 2250,
      isSample: true,
    },
    shots: [
      {
        id: 'shot-001',
        shotNumber: 1,
        rawStartFrame: 0,
        rawEndFrame: 180,
        startFrame: 0,
        endFrame: 180,
        startTimecode: frameToTimecode(0, FPS),
        endTimecode: frameToTimecode(180, FPS),
        duration: 6.0,
        durationFrames: 180,
        firstFrameUrl: generateKeyframeSvg(1, '首帧', frameToTimecode(0, FPS), 'cyan'),
        middleFrameUrl: generateKeyframeSvg(1, '中间帧', frameToTimecode(90, FPS), 'cyan'),
        lastFrameUrl: generateKeyframeSvg(1, '尾帧', frameToTimecode(180, FPS), 'cyan'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['远景', '航拍', '雪山全景', '开场'],
        notes: '高空远摄阿尔卑斯山脉日出晨光，光影过度自然。',
        confidence: 0.98,
      },
      {
        id: 'shot-002',
        shotNumber: 2,
        rawStartFrame: 181,
        rawEndFrame: 360,
        startFrame: 181,
        endFrame: 360,
        startTimecode: frameToTimecode(181, FPS),
        endTimecode: frameToTimecode(360, FPS),
        duration: 5.967,
        durationFrames: 180,
        firstFrameUrl: generateKeyframeSvg(2, '首帧', frameToTimecode(181, FPS), 'emerald'),
        middleFrameUrl: generateKeyframeSvg(2, '中间帧', frameToTimecode(270, FPS), 'emerald'),
        lastFrameUrl: generateKeyframeSvg(2, '尾帧', frameToTimecode(360, FPS), 'emerald'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['特写', '松林晨露', '摇镜'],
        notes: '慢速右摇特写镜头，微距捕捉树叶上的露珠闪烁。',
        confidence: 0.94,
      },
      {
        id: 'shot-003',
        shotNumber: 3,
        rawStartFrame: 361,
        rawEndFrame: 600,
        startFrame: 361,
        endFrame: 600,
        startTimecode: frameToTimecode(361, FPS),
        endTimecode: frameToTimecode(600, FPS),
        duration: 7.967,
        durationFrames: 240,
        firstFrameUrl: generateKeyframeSvg(3, '首帧', frameToTimecode(361, FPS), 'purple'),
        middleFrameUrl: generateKeyframeSvg(3, '中间帧', frameToTimecode(480, FPS), 'purple'),
        lastFrameUrl: generateKeyframeSvg(3, '尾帧', frameToTimecode(600, FPS), 'purple'),
        status: 'pending',
        modifiedSource: 'AI',
        tags: ['中景', '飞鸟追踪', '快速移动'],
        notes: '飞鸟掠过湖面，镜头跟随飞行轨迹，背景略有模糊待确认。',
        confidence: 0.82,
      },
      {
        id: 'shot-004',
        shotNumber: 4,
        rawStartFrame: 601,
        rawEndFrame: 960,
        startFrame: 601,
        endFrame: 960,
        startTimecode: frameToTimecode(601, FPS),
        endTimecode: frameToTimecode(960, FPS),
        duration: 11.967,
        durationFrames: 360,
        firstFrameUrl: generateKeyframeSvg(4, '首帧', frameToTimecode(601, FPS), 'amber'),
        middleFrameUrl: generateKeyframeSvg(4, '中间帧', frameToTimecode(780, FPS), 'amber'),
        lastFrameUrl: generateKeyframeSvg(4, '尾帧', frameToTimecode(960, FPS), 'amber'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['全景', '峡谷瀑布', '推镜头'],
        notes: '推镜头靠近瀑布潭底，水雾弥漫，主体视觉强烈。',
        confidence: 0.96,
      },
      {
        id: 'shot-005',
        shotNumber: 5,
        rawStartFrame: 961,
        rawEndFrame: 1200,
        startFrame: 961,
        endFrame: 1200,
        startTimecode: frameToTimecode(961, FPS),
        endTimecode: frameToTimecode(1200, FPS),
        duration: 7.967,
        durationFrames: 240,
        firstFrameUrl: generateKeyframeSvg(5, '首帧', frameToTimecode(961, FPS), 'indigo'),
        middleFrameUrl: generateKeyframeSvg(5, '中间帧', frameToTimecode(1080, FPS), 'indigo'),
        lastFrameUrl: generateKeyframeSvg(5, '尾帧', frameToTimecode(1200, FPS), 'indigo'),
        status: 'discard',
        modifiedSource: 'AI',
        tags: ['近景', '虚焦过场', '废镜头'],
        notes: '前景树枝遮挡过严，且存在1秒失焦，建议裁切或删除。',
        confidence: 0.65,
      },
      {
        id: 'shot-006',
        shotNumber: 6,
        rawStartFrame: 1201,
        rawEndFrame: 1650,
        startFrame: 1201,
        endFrame: 1650,
        startTimecode: frameToTimecode(1201, FPS),
        endTimecode: frameToTimecode(1650, FPS),
        duration: 14.967,
        durationFrames: 450,
        firstFrameUrl: generateKeyframeSvg(6, '首帧', frameToTimecode(1201, FPS), 'rose'),
        middleFrameUrl: generateKeyframeSvg(6, '中间帧', frameToTimecode(1425, FPS), 'rose'),
        lastFrameUrl: generateKeyframeSvg(6, '尾帧', frameToTimecode(1650, FPS), 'rose'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['大特写', '野生动物', '眼神锁定'],
        notes: '高分辨率特写雪豹眼神变化，景深极浅，画质优秀。',
        confidence: 0.99,
      },
      {
        id: 'shot-007',
        shotNumber: 7,
        rawStartFrame: 1651,
        rawEndFrame: 2250,
        startFrame: 1651,
        endFrame: 2250,
        startTimecode: frameToTimecode(1651, FPS),
        endTimecode: frameToTimecode(2250, FPS),
        duration: 19.967,
        durationFrames: 600,
        firstFrameUrl: generateKeyframeSvg(7, '首帧', frameToTimecode(1651, FPS), 'blue'),
        middleFrameUrl: generateKeyframeSvg(7, '中间帧', frameToTimecode(1950, FPS), 'blue'),
        lastFrameUrl: generateKeyframeSvg(7, '尾帧', frameToTimecode(2250, FPS), 'blue'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['远景', '夕阳晚霞', '压轴收尾'],
        notes: '镜头缓缓拉远，整座山谷沉浸在金色晚霞中，精彩片尾。',
        confidence: 0.97,
      },
    ],
  },
  {
    id: 'action_commercial',
    name: '示例：赛车广告快剪 (00:45)',
    description: '快速切分，包含闪切、硬切与镜头特写，适合检验高频切分场景。',
    metadata: {
      name: 'CyberCar_Commercial_Draft.mp4',
      size: 32000000,
      duration: 45.0,
      fps: FPS,
      width: 1920,
      height: 1080,
      url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      totalFrames: 1350,
      isSample: true,
    },
    shots: [
      {
        id: 'ac-001',
        shotNumber: 1,
        rawStartFrame: 0,
        rawEndFrame: 150,
        startFrame: 0,
        endFrame: 150,
        startTimecode: frameToTimecode(0, FPS),
        endTimecode: frameToTimecode(150, FPS),
        duration: 5.0,
        durationFrames: 150,
        firstFrameUrl: generateKeyframeSvg(1, '首帧', frameToTimecode(0, FPS), 'purple'),
        middleFrameUrl: generateKeyframeSvg(1, '中间帧', frameToTimecode(75, FPS), 'purple'),
        lastFrameUrl: generateKeyframeSvg(1, '尾帧', frameToTimecode(150, FPS), 'purple'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['车灯特写', '霓虹光影', '慢动作'],
        notes: '车大灯开启流光效果。',
        confidence: 0.95,
      },
      {
        id: 'ac-002',
        shotNumber: 2,
        rawStartFrame: 151,
        rawEndFrame: 300,
        startFrame: 151,
        endFrame: 300,
        startTimecode: frameToTimecode(151, FPS),
        endTimecode: frameToTimecode(300, FPS),
        duration: 4.967,
        durationFrames: 150,
        firstFrameUrl: generateKeyframeSvg(2, '首帧', frameToTimecode(151, FPS), 'rose'),
        middleFrameUrl: generateKeyframeSvg(2, '中间帧', frameToTimecode(225, FPS), 'rose'),
        lastFrameUrl: generateKeyframeSvg(2, '尾帧', frameToTimecode(300, FPS), 'rose'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['引擎轰鸣', '排气管火花', '特写'],
        notes: '弹射起步镜头。',
        confidence: 0.93,
      },
      {
        id: 'ac-003',
        shotNumber: 3,
        rawStartFrame: 301,
        rawEndFrame: 600,
        startFrame: 301,
        endFrame: 600,
        startTimecode: frameToTimecode(301, FPS),
        endTimecode: frameToTimecode(600, FPS),
        duration: 9.967,
        durationFrames: 300,
        firstFrameUrl: generateKeyframeSvg(3, '首帧', frameToTimecode(301, FPS), 'amber'),
        middleFrameUrl: generateKeyframeSvg(3, '中间帧', frameToTimecode(450, FPS), 'amber'),
        lastFrameUrl: generateKeyframeSvg(3, '尾帧', frameToTimecode(600, FPS), 'amber'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['弯道漂移', '烟雾弥漫', '环绕视角'],
        notes: '赛道漂移过弯。',
        confidence: 0.97,
      },
      {
        id: 'ac-004',
        shotNumber: 4,
        rawStartFrame: 601,
        rawEndFrame: 1350,
        startFrame: 601,
        endFrame: 1350,
        startTimecode: frameToTimecode(601, FPS),
        endTimecode: frameToTimecode(1350, FPS),
        duration: 24.967,
        durationFrames: 750,
        firstFrameUrl: generateKeyframeSvg(4, '首帧', frameToTimecode(601, FPS), 'cyan'),
        middleFrameUrl: generateKeyframeSvg(4, '中间帧', frameToTimecode(975, FPS), 'cyan'),
        lastFrameUrl: generateKeyframeSvg(4, '尾帧', frameToTimecode(1350, FPS), 'cyan'),
        status: 'keep',
        modifiedSource: 'AI',
        tags: ['冲线瞬间', '终点全景', '品牌Logo'],
        notes: '冲过终点线并定格品牌Logo。',
        confidence: 0.99,
      },
    ],
  },
];
