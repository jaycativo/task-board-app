// The page's shared, changing facts. Every module reads and writes this one object.
export const state = {
  board: null,      // the board as last received from the server
  busy: false,      // true while a change is being saved
  dragging: false,  // true while a card is being dragged
  noteCounts: {},   // how many notes each task has, by task ID
  sortMode: 'file', // 'file', 'priority', or 'due'
  style: 'playful', // 'playful' or 'minimal'
};
