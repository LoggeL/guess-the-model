// ============================================================================
// GUESS THE MODEL — challenge & entry configuration
// ----------------------------------------------------------------------------
// HOW TO ADD A NEW ENTRY (e.g. when gpt55pro / fable50 are ready):
//   1. Drop the .html file into games/<challenge-id>/  (use an ANONYMOUS name
//      that does NOT contain the model name, e.g. "p7r8x2.html").
//   2. Add one line to the `entries` array below:
//        { id: 'p7r8x2', model: 'GPT-5.5 Pro', file: 'games/ultrakill-clone/p7r8x2.html' },
//   That's it. The UI re-shuffles letters automatically.
//
// HOW TO ADD A NEW CHALLENGE (a new prompt with its own set of entries):
//   1. Create a folder: games/<new-challenge-id>/
//   2. Drop the entry .html files in there.
//   3. Add a new object to the `challenges` array below.
// ============================================================================

window.GTM_DATA = {
  // The guess step offers exactly the models that competed in each challenge —
  // the task is to match every entrant to the right build. No decoys.
  challenges: [
    {
      id: 'ultrakill-clone',
      title: 'ULTRAKILL Clone',
      tagline: 'Blood, style, and raw velocity',
      prompt: 'Make an ULTRAKILL clone in one HTML file as nice as you can.',
      promptMeta: 'Single self-contained .html file · no external assets required',
      accent: '#ff3030',
      accent2: '#ff8a3c',
      entries: [
        { id: 'k3x7a9', model: 'GLM-5.2',  file: 'games/ultrakill-clone/k3x7a9.html' },
        { id: 'm9p2q4', model: 'Grok 4.5', file: 'games/ultrakill-clone/m9p2q4.html' },
        { id: 'p7r8x2', model: 'GPT-5.5 Pro', file: 'games/ultrakill-clone/p7r8x2.html' },
        { id: 't4v6w1', model: 'Fable 5.0',    file: 'games/ultrakill-clone/t4v6w1.html' },
      ],
    },
  ],
};
