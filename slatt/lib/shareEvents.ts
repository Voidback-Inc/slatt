type Listener = (text: string) => void;
const _listeners: Listener[] = [];

export const shareEvents = {
  emit(text: string) { _listeners.forEach(l => l(text)); },
  on(fn: Listener): () => void {
    _listeners.push(fn);
    return () => {
      const i = _listeners.indexOf(fn);
      if (i > -1) _listeners.splice(i, 1);
    };
  },
};
