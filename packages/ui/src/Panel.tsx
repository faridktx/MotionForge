import React from "react";

export interface PanelProps {
  title: string;
  children?: React.ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">{title}</div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
