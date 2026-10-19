import { showLetter } from '../../../engine/draft/grades.ts';

interface Props {
  letter: string;
  /** what the grade is, for the accessible name: "draft day grade" */
  label?: string;
}

/** A grade as a small chip: A and B read green, C quiet, D and F red. The letter is the content, the colour only helps. */
export function LetterChip({ letter, label }: Props) {
  const tone = letter.startsWith('A') || letter.startsWith('B') ? 'ok' : letter.startsWith('C') ? 'mute' : 'bad';
  return <span className={`pill ${tone} gl`} aria-label={label ? `${label} ${showLetter(letter)}` : undefined}>{showLetter(letter)}</span>;
}
