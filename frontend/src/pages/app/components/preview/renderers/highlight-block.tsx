import type {ReactNode} from 'react';

type HighlightBlockProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function HighlightBlock({children, onClick, className}: HighlightBlockProps) {
  const interactive = typeof onClick === 'function';

  return (
    <div
      data-testid="preview-highlight-block"
      onClick={onClick}
      className={[
        'rounded-[8px] border border-[#E8C95A] bg-[#FFF7CC] shadow-sm',
        interactive ? 'cursor-pointer transition-colors hover:border-[#D4B240]' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
