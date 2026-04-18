export const EPISODE_SPLIT_PREFERENCES = ['auto', 'scene_group_2', 'scene_group_3'] as const

export type EpisodeSplitPreference = (typeof EPISODE_SPLIT_PREFERENCES)[number]

export const DEFAULT_EPISODE_SPLIT_PREFERENCE: EpisodeSplitPreference = 'auto'

export function isEpisodeSplitPreference(value: unknown): value is EpisodeSplitPreference {
    return typeof value === 'string'
        && (EPISODE_SPLIT_PREFERENCES as readonly string[]).includes(value)
}

export function getSceneGroupSize(preference: EpisodeSplitPreference | null | undefined): 2 | 3 | null {
    if (preference === 'scene_group_2') {
        return 2
    }
    if (preference === 'scene_group_3') {
        return 3
    }
    return null
}
