import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {HighlightBlock} from './highlight-block';

describe('HighlightBlock', () => {
  it('renders unified block highlight style', () => {
    render(<HighlightBlock>命中块</HighlightBlock>);
    const block = screen.getByTestId('preview-highlight-block');
    expect(block.className).toContain('bg-[#FFF7CC]');
    expect(block.className).toContain('border-[#E8C95A]');
    expect(block.className).toContain('rounded-[8px]');
  });

  it('invokes click handler when block is interactive', () => {
    const onClick = vi.fn();
    render(<HighlightBlock onClick={onClick}>命中块</HighlightBlock>);
    fireEvent.click(screen.getByTestId('preview-highlight-block'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
