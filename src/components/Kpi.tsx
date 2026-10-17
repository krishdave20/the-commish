import type { ReactNode } from 'react';

interface Props {
  label: string;
  /** the big serif figure */
  children: ReactNode;
  sub?: ReactNode;
}

export function Kpi({ label, children, sub }: Props) {
  return (
    <div className="kpi">
      <div className="micro">{label}</div>
      <div className="big">{children}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
