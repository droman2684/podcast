import { nextInQueue } from '@shared/queueView'

// Mirrors the desktop app's useAudioEngine `ended` handler: figure out
// what's next before removing the finished episode from the queue, since
// removal shifts every subsequent index down by one.
export function removeFromQueueOnFinish(
  queue: string[],
  finishedEpisodeId: string,
  removeFromQueue: (episodeId: string) => void
): string | null {
  const nextId = nextInQueue(queue, finishedEpisodeId)
  if (queue.includes(finishedEpisodeId)) removeFromQueue(finishedEpisodeId)
  return nextId
}
