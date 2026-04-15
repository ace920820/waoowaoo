import type { NovelPromotionShotGroup } from '@/types/project'
import { AppIcon } from '@/components/ui/icons'

interface ShotGroupVideoSectionProps {
  shotGroups?: NovelPromotionShotGroup[]
}

export default function ShotGroupVideoSection({ shotGroups = [] }: ShotGroupVideoSectionProps) {
  return (
    <section className="glass-surface p-4 space-y-4">
      <div className="flex items-center gap-2 text-[var(--glass-text-primary)]">
        <AppIcon name="film" className="h-4 w-4 text-[var(--glass-tone-info-fg)]" />
        <div>
          <h3 className="text-sm font-semibold">镜头组视频区（占位）</h3>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
            本阶段仅分出承接位，后续再接 Shot Group Video Run 与长视频生成。
          </p>
        </div>
      </div>

      {shotGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-4 py-6 text-sm text-[var(--glass-text-tertiary)]">
          当前没有镜头组；先在 storyboard 阶段创建镜头组，再回到这里承接组视频能力。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shotGroups.map((group) => (
            <article key={group.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">{group.title}</h4>
                  <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">模板：{group.templateKey} · 占位镜头 {(group.items || []).length} 个</p>
                </div>
                <span className="rounded-lg bg-[var(--glass-bg-muted)] px-2 py-1 text-xs text-[var(--glass-text-secondary)]">
                  未接通
                </span>
              </div>
              <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-3">
                {group.groupPrompt || '还没有填写组提示词。'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
