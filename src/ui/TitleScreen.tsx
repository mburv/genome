interface Props {
  onPlay: () => void;
  onSettings: () => void;
}

const SENSE = ['A', 'T', 'G', 'C', 'A', 'T'] as const;
const ANTISENSE = ['T', 'A', 'C', 'G', 'T', 'A'] as const;

/** Entry screen: wordmark, a short complementary strand, and Play to the level map. */
export function TitleScreen({ onPlay, onSettings }: Props) {
  return (
    <section className="title-screen" aria-label="Title" data-testid="title-screen">
      <div className="title-bar">
        <button type="button" className="map-button" onClick={onSettings} aria-label="Settings" data-testid="open-settings">⚙</button>
      </div>
      <div className="title-center">
        <h1 className="title-wordmark" data-testid="title-wordmark">GENOME</h1>
        <p className="title-tag" data-testid="title-tag">ASSEMBLE THE HUMAN GENOME</p>
        <div className="title-motif" aria-hidden="true" data-testid="title-motif">
          <div className="title-strand">
            {SENSE.map((b, i) => <span key={`s${i}`} className={`title-base b-${b}`}>{b}</span>)}
          </div>
          <div className="title-strand">
            {ANTISENSE.map((b, i) => <span key={`a${i}`} className={`title-base b-${b}`}>{b}</span>)}
          </div>
        </div>
        <button type="button" className="primary title-play" onClick={onPlay} data-testid="title-play">Play</button>
      </div>
    </section>
  );
}
