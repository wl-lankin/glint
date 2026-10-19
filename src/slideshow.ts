// The slideshow clock. The app feeds it frame times; it reports progress and when to advance.

export class Slideshow {
  playing = false;
  elapsed = 0;
  /** While an image is still loading the clock waits, so a slow file still gets its full time. */
  held = false;

  constructor(
    public interval: number,
    private readonly onAdvance: () => void,
    private readonly onChange: (playing: boolean, progress: number) => void,
  ) {}

  play() {
    if (this.playing) return;
    this.playing = true;
    this.onChange(true, this.progress());
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.onChange(false, this.progress());
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** A new image is on screen: its time starts now. */
  restart() {
    this.elapsed = 0;
    this.held = false;
    this.onChange(this.playing, 0);
  }

  tick(dt: number) {
    if (!this.playing || this.held) return;
    this.elapsed += Math.max(0, Math.min(dt, 250));
    if (this.elapsed >= this.interval) {
      this.elapsed = this.interval;
      this.held = true;
      this.onChange(true, 1);
      this.onAdvance();
      return;
    }
    this.onChange(true, this.progress());
  }

  progress() {
    return this.interval > 0 ? Math.min(1, this.elapsed / this.interval) : 0;
  }
}
