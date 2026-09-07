// Reversible, finite motion. An idle object never requests another frame.
export class Motion {
  constructor(value = 0) {
    this.value = value;
    this.target = value;
    this.from = value;
    this.start = 0;
    this.duration = 0;
  }
  set(target, now, instant = false) {
    this.tick(now);
    if (instant) {
      this.value = this.from = this.target = target;
      this.duration = 0;
      return;
    }
    if (target === this.target) return;
    this.from = this.value;
    this.target = target;
    this.start = now;
    this.duration =
      (target > this.value ? 620 : 460) * Math.abs(target - this.value);
  }
  tick(now) {
    if (!this.duration) return false;
    const p = Math.max(0, Math.min(1, (now - this.start) / this.duration));
    const eased = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    this.value = this.from + (this.target - this.from) * eased;
    if (p === 1) {
      this.value = this.target;
      this.duration = 0;
    }
    return !!this.duration;
  }
}
