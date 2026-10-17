interface Props { message: string }

/** Shown when the data layer cannot start (for example while it is still being built). */
export function StartupError({ message }: Props) {
  return (
    <div className="signin-wrap">
      <div className="signin">
        <div className="micro">War Room</div>
        <h1>Could not start</h1>
        <p className="note neg-c" role="alert">{message}</p>
      </div>
    </div>
  );
}
