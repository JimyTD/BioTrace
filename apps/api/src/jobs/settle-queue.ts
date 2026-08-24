/**
 * 稀有度 / 开包结算队列。与识图队列分开：Gemini 识图不该被 TokenHub 量表堵住。
 * TokenHub 免费档约 1 并发，所以这里默认也串行。
 * 观察仍保持 analyzing，直到本队列写完 rarity 才变 pending_settle。
 */
type Job = () => Promise<void>;

let running = 0;
const q: Job[] = [];

async function pump() {
  while (running < 1 && q.length) {
    const job = q.shift()!;
    running++;
    void job()
      .catch((err) => {
        console.error("[settle-queue] job error", err);
      })
      .finally(() => {
        running--;
        void pump();
      });
  }
}

export function enqueueSettleJob(job: Job) {
  q.push(job);
  void pump();
}

export function settleQueueSize() {
  return { pending: q.length, running };
}
