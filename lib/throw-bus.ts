// Notes thrown from guests' phones, passed from the big screen's data (LiveScreen)
// to its animation (StageScreen), which makes them fly from the right name.

export type ThrowListener = (transferId: number, notes: number[]) => void;

export class ThrowBus {
  private listeners = new Set<ThrowListener>();
  on(fn: ThrowListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /** `notes`: which note picture each throw uses (see NOTES in components/Confetti). */
  emit(transferId: number, notes: number[]) {
    for (const fn of this.listeners) fn(transferId, notes);
  }
}
