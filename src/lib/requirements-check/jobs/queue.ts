type Job = () => Promise<void>;

const queue: Job[] = [];
let active = 0;
const MAX_ACTIVE = 2;

export function enqueueScanJob(job: Job): void {
  queue.push(job);
  void drain();
}

async function drain() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    const job = queue.shift();
    if (!job) return;
    active += 1;
    job()
      .catch((error) => {
        console.error("[requirements-check] job failed:", error);
      })
      .finally(() => {
        active -= 1;
        void drain();
      });
  }
}

export function getQueueStats() {
  return { active, queued: queue.length };
}
