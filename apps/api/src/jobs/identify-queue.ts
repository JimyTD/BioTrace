import { env } from "../env.js";

type Job = () => Promise<void>;

let running = 0;
const q: Job[] = [];

async function pump() {
  const concurrency = Math.max(1, env.identifyConcurrency || 1);
  while (running < concurrency && q.length) {
    const job = q.shift()!;
    running++;
    void job()
      .catch((err) => {
        console.error("[identify-queue] job error", err);
      })
      .finally(() => {
        running--;
        void pump();
      });
  }
}

/** FIFO queue so free-tier providers are not burst-fired. */
export function enqueueIdentifyJob(job: Job) {
  q.push(job);
  void pump();
}

export function identifyQueueSize() {
  return { pending: q.length, running };
}
