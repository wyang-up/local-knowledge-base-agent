import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {JsonPreview} from './JsonPreview';
import {PdfPreview} from './PdfPreview';
import {TablePreview} from './TablePreview';
import {TextPreview} from './TextPreview';

describe('pdf preview renderer', () => {
  it('renders pdf viewer with basic controls', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    expect(screen.getByRole('button', {name: '上一页'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '下一页'})).toBeInTheDocument();
    expect(screen.getByLabelText('页码')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '缩小'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '放大'})).toBeInTheDocument();
    expect(screen.getByTitle('PDF 预览内容')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '上一页'})).toBeDisabled();
  });

  it('keeps page unchanged for invalid page input', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    const pageInput = screen.getByLabelText('页码') as HTMLInputElement;
    fireEvent.change(pageInput, {target: {value: '3'}});
    expect(pageInput).toHaveValue(3);

    fireEvent.change(pageInput, {target: {value: '0'}});
    expect(pageInput).toHaveValue(3);
  });

  it('enforces known total pages on next button and manual input', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" totalPages={2} />);

    const nextButton = screen.getByRole('button', {name: '下一页'});
    const pageInput = screen.getByLabelText('页码') as HTMLInputElement;

    fireEvent.click(nextButton);
    expect(pageInput).toHaveValue(2);
    expect(nextButton).toBeDisabled();

    fireEvent.change(pageInput, {target: {value: '999'}});
    expect(pageInput).toHaveValue(2);
  });

  it('enforces zoom lower and upper bounds', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    const zoomOut = screen.getByRole('button', {name: '缩小'});
    const zoomIn = screen.getByRole('button', {name: '放大'});

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(zoomOut);
    }
    expect(screen.getByText('50%')).toBeInTheDocument();

    for (let i = 0; i < 40; i += 1) {
      fireEvent.click(zoomIn);
    }
    expect(screen.getByText('300%')).toBeInTheDocument();
  });

  it('updates iframe src when page or zoom changes', () => {
    const src = 'blob:https://example.com/mock-pdf';
    render(<PdfPreview src={src} />);

    const iframe = screen.getByTitle('PDF 预览内容') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(`${src}#page=1&zoom=100`);

    fireEvent.click(screen.getByRole('button', {name: '下一页'}));
    expect(iframe.getAttribute('src')).toBe(`${src}#page=2&zoom=100`);

    fireEvent.click(screen.getByRole('button', {name: '放大'}));
    expect(iframe.getAttribute('src')).toBe(`${src}#page=2&zoom=110`);
  });

  it('resets page and zoom when src changes', () => {
    const firstSrc = 'blob:https://example.com/mock-pdf-a';
    const secondSrc = 'blob:https://example.com/mock-pdf-b';
    const {rerender} = render(<PdfPreview src={firstSrc} />);

    fireEvent.click(screen.getByRole('button', {name: '下一页'}));
    fireEvent.click(screen.getByRole('button', {name: '放大'}));

    rerender(<PdfPreview src={secondSrc} />);

    const pageInput = screen.getByLabelText('页码') as HTMLInputElement;
    const iframe = screen.getByTitle('PDF 预览内容') as HTMLIFrameElement;

    expect(pageInput).toHaveValue(1);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(iframe.getAttribute('src')).toBe(`${secondSrc}#page=1&zoom=100`);
  });

  it('shows partial preview notice when flagged', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" isPartialPreview />);

    expect(screen.getByText('当前仅展示部分预览内容。')).toBeInTheDocument();
  });

  it('shows friendly message in error state', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" errorMessage="PDF 加载失败" />);

    expect(screen.getByText('PDF 预览失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('PDF 加载失败')).toBeInTheDocument();
  });
});

describe('table preview renderer', () => {
  it('switches active sheet in xlsx preview', () => {
    render(
      <TablePreview
        sheets={[
          {
            id: 'sheet-1',
            name: 'Sheet 1',
            columns: ['姓名', '年龄'],
            rows: [['张三', 18]],
          },
          {
            id: 'sheet-2',
            name: 'Sheet 2',
            columns: ['城市'],
            rows: [['北京']],
          },
        ]}
      />,
    );

    const firstTab = screen.getByRole('tab', {name: 'Sheet 1'});
    const secondTab = screen.getByRole('tab', {name: 'Sheet 2'});

    expect(firstTab).toHaveAttribute('aria-selected', 'true');
    expect(firstTab).toHaveAttribute('aria-controls');
    const controlledPanelId = firstTab.getAttribute('aria-controls') as string;
    expect(screen.getByRole('tabpanel', {name: 'Sheet 1'})).toHaveAttribute('id', controlledPanelId);
    expect(screen.getByRole('cell', {name: '张三'})).toBeInTheDocument();
    expect(screen.queryByRole('cell', {name: '北京'})).not.toBeInTheDocument();

    fireEvent.click(secondTab);

    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('cell', {name: '北京'})).toBeInTheDocument();
    expect(screen.queryByRole('cell', {name: '张三'})).not.toBeInTheDocument();
  });

  it('supports keyboard navigation for sheet tabs', () => {
    render(
      <TablePreview
        sheets={[
          {
            id: 'sheet-1',
            name: 'Sheet 1',
            columns: ['姓名'],
            rows: [['张三']],
          },
          {
            id: 'sheet-2',
            name: 'Sheet 2',
            columns: ['城市'],
            rows: [['北京']],
          },
        ]}
      />,
    );

    const firstTab = screen.getByRole('tab', {name: 'Sheet 1'});
    const secondTab = screen.getByRole('tab', {name: 'Sheet 2'});

    firstTab.focus();
    fireEvent.keyDown(firstTab, {key: 'ArrowRight'});
    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(secondTab).toHaveFocus();

    fireEvent.keyDown(secondTab, {key: 'ArrowLeft'});
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
    expect(firstTab).toHaveFocus();
  });

  it('renders single sheet in csv preview', () => {
    render(
      <TablePreview
        sheets={[
          {
            id: 'csv',
            name: 'CSV',
            columns: ['name', 'score'],
            rows: [['Alice', 99]],
          },
        ]}
      />,
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: 'name'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: 'score'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: 'Alice'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '99'})).toBeInTheDocument();
  });

  it('includes sticky header class and scroll container', () => {
    render(
      <TablePreview
        sheets={[
          {
            id: 'sheet-1',
            name: 'Sheet 1',
            columns: ['A'],
            rows: [['row-1']],
          },
        ]}
      />,
    );

    expect(screen.getByTestId('table-preview-scroll-container')).toHaveClass('overflow-auto');
    expect(screen.getByRole('columnheader', {name: 'A'})).toHaveClass('sticky');
  });

  it('shows empty state when sheets is empty', () => {
    render(<TablePreview sheets={[]} />);

    expect(screen.getByTestId('table-preview-empty')).toBeInTheDocument();
    expect(screen.getByText('暂无表格可预览。')).toBeInTheDocument();
  });

  it('shows friendly message in error state', () => {
    render(<TablePreview sheets={[]} errorMessage="表格读取失败" />);

    expect(screen.getByTestId('table-preview-error')).toBeInTheDocument();
    expect(screen.getByText('表格预览失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('表格读取失败')).toBeInTheDocument();
  });

  it('renders irregular rows with auto-filled headers safely', () => {
    render(
      <TablePreview
        sheets={[
          {
            id: 'sheet-1',
            name: 'Sheet 1',
            columns: ['已知列'],
            rows: [
              ['A1', 'A2', null],
              ['B1'],
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', {name: '已知列'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '列 2'})).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: '列 3'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: 'A2'})).toBeInTheDocument();
    expect(screen.getAllByRole('cell')).toHaveLength(6);
  });
});

describe('json preview renderer', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('renders tree structure and supports collapse/expand', () => {
    render(
      <JsonPreview
        value={{
          profile: {
            name: 'Alice',
            age: 20,
          },
          tags: ['admin'],
        }}
      />,
    );

    expect(screen.getByText('profile')).toBeInTheDocument();
    expect(screen.queryByText('name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '展开 profile'}));
    expect(screen.getByText('name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '折叠 profile'}));
    expect(screen.queryByText('name')).not.toBeInTheDocument();
  });

  it('shows partial preview notice in json renderer', () => {
    render(<JsonPreview value={{name: 'Alice'}} isPartialPreview />);

    expect(screen.getByText('当前仅展示部分预览内容。')).toBeInTheDocument();
  });

  it('shows friendly json error state', () => {
    render(<JsonPreview value={'{"name":'} />);

    expect(screen.getByText('JSON 预览失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('JSON 格式错误，无法解析预览内容。')).toBeInTheDocument();
  });

  it('copies full json when clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    });

    render(<JsonPreview value={{name: 'Alice', age: 20}} />);

    fireEvent.click(screen.getByRole('button', {name: '复制全文'}));

    expect(writeText).toHaveBeenCalledWith(`{
  "name": "Alice",
  "age": 20
}`);
    expect(await screen.findByRole('status')).toHaveTextContent('已复制。');
  });

  it('shows friendly message when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    });

    render(<JsonPreview value={{name: 'Alice'}} />);

    fireEvent.click(screen.getByRole('button', {name: '复制全文'}));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('复制失败，请稍后重试。');
  });

  it('handles collapse with keys containing dots', () => {
    render(
      <JsonPreview
        value={{
          'user.name': {
            first: 'Alice',
          },
          user: {
            name: 'Bob',
          },
        }}
      />,
    );

    expect(screen.queryByText('first')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '展开 user.name'}));
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '折叠 user.name'}));
    expect(screen.queryByText('first')).not.toBeInTheDocument();
  });
});

describe('text preview renderer', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('renders text and supports basic search interaction', () => {
    render(<TextPreview text="hello world\nsecond line" />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    const scrollContainer = screen.getByTestId('text-preview-scroll-container');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass('overflow-auto');
    expect(scrollContainer).toHaveClass('max-h-[480px]');

    const content = screen.getByTestId('text-preview-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent('hello world');

    const searchInput = screen.getByLabelText('搜索文本');
    fireEvent.change(searchInput, {target: {value: 'world'}});

    const highlighted = screen.getByTestId('text-preview-highlight');
    expect(highlighted).toHaveTextContent('world');
    expect(screen.getByRole('status')).toHaveTextContent('已匹配 1 处');
  });

  it('copies full text and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    });

    render(<TextPreview text="copy me" />);

    fireEvent.click(screen.getByRole('button', {name: '复制全文'}));

    expect(writeText).toHaveBeenCalledWith('copy me');
    expect(await screen.findByRole('status')).toHaveTextContent('已复制。');
  });

  it('shows friendly message when clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(<TextPreview text="copy me" />);

    fireEvent.click(screen.getByRole('button', {name: '复制全文'}));

    expect(screen.getByRole('status')).toHaveTextContent('当前环境不支持复制，请手动复制。');
  });

  it('shows friendly message when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    });

    render(<TextPreview text="copy me" />);

    fireEvent.click(screen.getByRole('button', {name: '复制全文'}));

    expect(writeText).toHaveBeenCalledWith('copy me');
    expect(await screen.findByRole('status')).toHaveTextContent('复制失败，请稍后重试。');
  });

  it('shows friendly message in error state', () => {
    render(<TextPreview text="" errorMessage="文本读取失败" />);

    expect(screen.getByTestId('text-preview-error')).toBeInTheDocument();
    expect(screen.getByText('文本预览失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('文本读取失败')).toBeInTheDocument();
  });
});
