import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {JsonPreview} from './JsonPreview';
import {PdfPreview} from './PdfPreview';
import {TablePreview} from './TablePreview';
import {TextPreview} from './TextPreview';

const {mockPdfGetDocument} = vi.hoisted(() => ({
  mockPdfGetDocument: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: mockPdfGetDocument,
}));

describe('pdf preview renderer', () => {
  beforeEach(() => {
    mockPdfGetDocument.mockReset();
    const renderMock = vi.fn(() => ({promise: Promise.resolve()}));
    mockPdfGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (pageNumber: number) => ({
          getViewport: () => ({width: 600, height: 800}),
          getTextContent: async () => ({
            items: pageNumber === 2
              ? [{str: '这里是目标朔源内容片段', transform: [1, 0, 0, 1, 0, 280]}]
              : [{str: '其他页面内容', transform: [1, 0, 0, 1, 0, 760]}],
          }),
          render: renderMock,
        }),
      }),
    });
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({chunks: []}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      }),
    );
  });

  it('renders original-style pdf pages without iframe toolbar viewer', async () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    expect(screen.queryByRole('button', {name: '滚动模式'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '分页模式'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '适配页宽'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '复制文本'})).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('全文搜索')).not.toBeInTheDocument();
    const iframe = await screen.findByTitle('PDF 预览内容');
    expect(iframe).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-preview-pages')).not.toBeInTheDocument();
  });

  it('uses full-height layout to avoid blank area below pdf viewer', async () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    const sections = screen.getAllByTestId('pdf-preview-renderer');
    const section = sections[sections.length - 1];
    const iframes = await screen.findAllByTitle('PDF 预览内容');
    const iframe = iframes[iframes.length - 1];

    expect(section.className).toContain('h-full');
    expect(section.className).toContain('min-h-0');
    expect(iframe.className).toContain('flex-1');
    expect(iframe.className).toContain('min-h-0');
  });

  it('does not render page controls', () => {
    render(<PdfPreview src="blob:https://example.com/mock-pdf" />);

    expect(screen.queryByRole('button', {name: '上一页'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '下一页'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('页码')).not.toBeInTheDocument();
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

  it('renders original-style pdf page surface with overlay highlight', async () => {
    render(
      <PdfPreview
        src="/api/documents/doc-1/content"
        sourceHighlight={{
          chunkId: 'chunk-2',
          chunkIndex: 1,
          pageStart: 2,
          textQuote: '这里是目标朔源内容片段',
          content: '这里是目标朔源内容片段',
        }}
      />, 
    );

    await waitFor(() => {
      const iframes = screen.getAllByTitle('PDF 预览内容') as HTMLIFrameElement[];
      const iframe = iframes[iframes.length - 1];
      const src = iframe.getAttribute('src') ?? '';
      expect(src).toContain('page=2');
      expect(src).toContain('search=');
    });
  });

  it('renders page-level fallback highlight when page is known but quote is not found', async () => {
    render(
      <PdfPreview
        src="/api/documents/doc-1/content"
        sourceHighlight={{
          pageStart: 2,
          textQuote: '不存在的片段',
          content: '不存在的片段',
        }}
      />,
    );

    const iframes = await screen.findAllByTitle('PDF 预览内容') as HTMLIFrameElement[];
    const iframe = iframes[iframes.length - 1];
    expect(iframe.getAttribute('src')).toContain('page=2');
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
    const tablist = screen.getByRole('tablist', {name: '工作表切换'});

    expect(tablist.className).toContain('bg-[#e6f0ff]');
    expect(tablist.className).toContain('border-b');
    expect(tablist.className).toContain('border-[#1677FF]');
    expect(tablist.className).toContain('rounded-[8px]');
    expect(tablist.className).toContain('px-4');
    expect(tablist.className).toContain('py-2');

    expect(firstTab.className).toContain('rounded-[8px]');
    expect(firstTab.className).toContain('px-4');
    expect(firstTab.className).toContain('py-1.5');
    expect(firstTab.className).toContain('border');
    expect(firstTab.className).toContain('border-[#1677FF]');
    expect(firstTab.className).toContain('transition-all');
    expect(firstTab.className).toContain('active:scale-[0.98]');
    expect(firstTab.className).toContain('bg-[#1677FF]');
    expect(firstTab.className).toContain('text-white');

    expect(secondTab.className).toContain('bg-transparent');
    expect(secondTab.className).toContain('text-[#333333]');
    expect(secondTab.className).toContain('hover:bg-[#e6f0ff]');

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

  it('keeps selected sheet after parent rerender with same sheet ids', () => {
    const sheets = [
      {
        id: 'sheet-1',
        name: '秋招',
        columns: ['姓名'],
        rows: [['张三']],
      },
      {
        id: 'sheet-2',
        name: '春招',
        columns: ['姓名'],
        rows: [['李四']],
      },
    ];

    const {rerender} = render(<TablePreview sheets={sheets} />);

    fireEvent.click(screen.getByRole('tab', {name: '春招'}));
    expect(screen.getByRole('tab', {name: '春招'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('cell', {name: '李四'})).toBeInTheDocument();

    const rerenderedSheets = [
      {
        id: 'sheet-1',
        name: '秋招',
        columns: ['姓名'],
        rows: [['张三']],
      },
      {
        id: 'sheet-2',
        name: '春招',
        columns: ['姓名'],
        rows: [['李四']],
      },
    ];

    rerender(<TablePreview sheets={rerenderedSheets} />);

    expect(screen.getByRole('tab', {name: '春招'})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('cell', {name: '李四'})).toBeInTheDocument();
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

  it('switches to matched sheet and highlights matched row for source snippet', () => {
    render(
      <TablePreview
        sourceHighlight={{content: '李四'}}
        sheets={[
          {
            id: 'sheet-1',
            name: '秋招',
            columns: ['姓名'],
            rows: [['张三']],
          },
          {
            id: 'sheet-2',
            name: '春招',
            columns: ['姓名'],
            rows: [['李四']],
          },
        ]}
      />,
    );

    return waitFor(() => {
      expect(screen.getByRole('tab', {name: '春招'})).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('table-preview-source-highlight-row')).toBeInTheDocument();
      expect(screen.getByRole('cell', {name: '李四'})).toBeInTheDocument();
    });
  });

  it('highlights matched row range block inside selected sheet', () => {
    render(
      <TablePreview
        sheets={[
          {id: 'sheet-1', name: 'Sheet 1', columns: ['姓名'], rows: [['张三'], ['李四'], ['王五']]},
        ]}
        sourceHighlight={{sheetId: 'sheet-1', rowStart: 1, rowEnd: 2, content: '李四 王五'}}
      />,
    );

    expect(screen.getAllByTestId('table-preview-source-highlight-row')).toHaveLength(2);
  });
});

describe('json preview renderer', () => {
  it('renders raw json text content', () => {
    render(
      <JsonPreview
        value={'{"profile":{"name":"Alice","age":20},"tags":["admin"]}'}
      />,
    );

    expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"profile"');
    expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"Alice"');
    expect(screen.queryByRole('button', {name: /展开|折叠/})).not.toBeInTheDocument();
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

  it('does not render copy toolbar in json preview', () => {
    render(<JsonPreview value={{name: 'Alice', age: 20}} />);

    expect(screen.queryByRole('button', {name: '复制全文'})).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stringifies object input into readable json text', () => {
    render(
      <JsonPreview
        value={{
          profile: {
            name: 'Alice',
          },
        }}
      />,
    );

    expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"profile"');
    expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"Alice"');
  });

  it('highlights source snippet inside json preview', () => {
    render(<JsonPreview value={'{"name":"Alice","city":"Beijing"}'} sourceHighlight={{content: '  "city": "Beijing"'}} />);

    expect(screen.getByTestId('preview-highlight-block')).toHaveTextContent('"city": "Beijing"');
  });

  it('renders json source as original-text block highlight', () => {
    const onBackToQa = vi.fn();
    render(
      <JsonPreview
        value={'{"profile": {\n  "name": "Alice"\n},"tags":["admin"]}'}
        sourceHighlight={{content: '"profile": {\n  "name": "Alice"\n}'}}
        onSourceBlockAuxClick={onBackToQa}
      />,
    );

    expect(screen.getByTestId('preview-highlight-block')).toBeInTheDocument();
    expect(screen.getByTestId('json-preview-content')).toHaveTextContent('"profile"');
    fireEvent.click(screen.getByTestId('json-preview-source-highlight-back-to-qa'));
    expect(onBackToQa).toHaveBeenCalledTimes(1);
  });

  it('prefers node offsets over fuzzy source matching when the same json snippet appears multiple times', () => {
    const value = {
      users: [
        {profile: {name: 'Alice'}},
        {profile: {name: 'Alice'}},
      ],
    };
    const text = JSON.stringify(value, null, 2);
    const firstMatchStart = text.indexOf('"profile": {');
    const secondMatchStart = text.indexOf('"profile": {', firstMatchStart + 1);
    const secondMatchEnd = text.indexOf('}', secondMatchStart) + 1;

    render(
      <JsonPreview
        value={value}
        sourceHighlight={{
          content: 'Alice',
          nodeStartOffset: secondMatchStart,
          nodeEndOffset: secondMatchEnd,
        }}
      />,
    );

    const content = screen.getByTestId('json-preview-content');
    const beforeHighlight = content.firstChild?.textContent ?? '';
    const afterHighlight = content.lastChild?.textContent ?? '';
    const highlight = screen.getByTestId('json-preview-source-highlight');

    expect(beforeHighlight).toContain('},\n    {\n      ');
    expect(highlight).toHaveTextContent('"profile": {');
    expect(afterHighlight).toContain('\n    }\n  ]');
  });

  it('falls back to generic jsonPath targeting when node offsets are unavailable', () => {
    const value = {
      users: [
        {id: 1, profile: {name: 'Alice'}},
        {id: 2, profile: {name: 'Alice'}},
      ],
    };

    render(
      <JsonPreview
        value={value}
        sourceHighlight={{
          content: 'Alice',
          jsonPath: '$.users[1].profile',
        }}
      />,
    );

    const content = screen.getByTestId('json-preview-content');
    const beforeHighlight = content.firstChild?.textContent ?? '';
    const highlight = screen.getByTestId('json-preview-source-highlight');

    expect(beforeHighlight).toContain('"id": 2');
    expect(beforeHighlight).toContain('"profile": ');
    expect(highlight).toHaveTextContent('{');
    expect(highlight).toHaveTextContent('"name": "Alice"');
  });
});

describe('text preview renderer', () => {
  it('renders text and supports basic search interaction', () => {
    render(<TextPreview text="hello world\nsecond line" />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    const scrollContainer = screen.getByTestId('text-preview-scroll-container');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass('overflow-y-auto');
    expect(scrollContainer).toHaveClass('flex-1');

    const content = screen.getByTestId('text-preview-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent('hello world');

    const toolbar = screen.getByTestId('text-preview-toolbar');
    expect(toolbar.className).toContain('bg-[#1677FF]');
    expect(toolbar.className).toContain('bg-gradient-to-b');
    expect(toolbar.className).toContain('from-[#1677FF]');
    expect(toolbar.className).toContain('to-[#1570F0]');
    expect(toolbar.className).toContain('w-full');
    expect(toolbar.className).not.toContain('mb-2');
    expect(toolbar.className).toContain('border-t');
    expect(toolbar.className).toContain('border-b');
    expect(toolbar.className).toContain('border-[rgba(255,255,255,0.2)]');
    expect(toolbar.className).toContain('rounded-b-[8px]');
    expect(toolbar.className).toContain('px-4');
    expect(toolbar.className).toContain('py-2');

    const searchInput = screen.getByLabelText('搜索文本');
    expect(searchInput.className).toContain('bg-[rgba(255,255,255,0.15)]');
    expect(searchInput.className).toContain('border-[rgba(255,255,255,0.2)]');
    expect(searchInput.className).toContain('rounded-[8px]');
    expect(searchInput.className).toContain('placeholder:text-[#FFFFFF99]');
    expect(searchInput.className).toContain('px-3');
    expect(searchInput.className).toContain('py-1');
    expect(searchInput.className).toContain('hover:bg-[rgba(255,255,255,0.22)]');
    expect(searchInput.className).toContain('focus:bg-white');
    expect(searchInput.className).toContain('focus:text-gray-700');

    expect(screen.queryByRole('button', {name: '复制全文'})).not.toBeInTheDocument();

    fireEvent.change(searchInput, {target: {value: 'world'}});

    const highlighted = screen.getByTestId('text-preview-highlight');
    expect(highlighted).toHaveTextContent('world');
    expect(screen.getByRole('status')).toHaveTextContent('已匹配 1 处');
  });

  it('shows friendly message in error state', () => {
    render(<TextPreview text="" errorMessage="文本读取失败" />);

    expect(screen.getByTestId('text-preview-error')).toBeInTheDocument();
    expect(screen.getByText('文本预览失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.getByText('文本读取失败')).toBeInTheDocument();
  });

  it('highlights source snippet inside text preview', () => {
    render(<TextPreview text="第一段\n关键命中内容\n第三段" sourceHighlight={{content: '关键命中内容'}} />);

    expect(screen.getByTestId('preview-highlight-block')).toHaveTextContent('关键命中内容');
  });

  it('renders text source as block highlight and supports click-through', () => {
    const onOpenDetail = vi.fn();
    const onBackToQa = vi.fn();
    render(
      <TextPreview
        text="第一段\n目标分块正文\n第三段"
        sourceHighlight={{content: '目标分块正文'}}
        onSourceBlockClick={onOpenDetail}
        onSourceBlockAuxClick={onBackToQa}
      />,
    );

    expect(screen.getByTestId('preview-highlight-block')).toHaveTextContent('目标分块正文');
    fireEvent.click(screen.getByTestId('preview-highlight-block'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('text-preview-source-highlight-back-to-qa'));
    expect(onBackToQa).toHaveBeenCalledTimes(1);
  });

  it('prefers text offsets over fuzzy source matching when the same snippet appears multiple times', () => {
    const text = '第一处命中\n上下文A\n重复片段\n中间内容\n重复片段\n目标尾部';
    const firstMatchStart = text.indexOf('重复片段');
    const secondMatchStart = text.indexOf('重复片段', firstMatchStart + 1);

    render(
      <TextPreview
        text={text}
        sourceHighlight={{
          content: '重复片段',
          textQuote: '重复片段',
          textOffsetStart: secondMatchStart,
          textOffsetEnd: secondMatchStart + '重复片段'.length,
        }}
      />,
    );

    const content = screen.getByTestId('text-preview-content');
    const beforeHighlight = content.firstChild?.textContent ?? '';
    const afterHighlight = content.lastChild?.textContent ?? '';

    expect(beforeHighlight).toContain('中间内容');
    expect(afterHighlight).toContain('目标尾部');
  });

  it('falls back to text quote matching when offsets drift away from the provided snippet', () => {
    const text = '第一处命中\n上下文A\n重复片段\n中间内容\n重复片段\n目标尾部';
    const firstMatchStart = text.indexOf('重复片段');
    const secondMatchStart = text.indexOf('重复片段', firstMatchStart + 1);

    render(
      <TextPreview
        text={text}
        sourceHighlight={{
          content: '重复片段',
          textQuote: '重复片段',
          textOffsetStart: secondMatchStart - 1,
          textOffsetEnd: secondMatchStart - 1 + '重复片段'.length,
        }}
      />,
    );

    const content = screen.getByTestId('text-preview-content');
    const beforeHighlight = content.firstChild?.textContent ?? '';

    expect(beforeHighlight).not.toContain('中间内容');
  });

  it('keeps offset-selected occurrence when content matches even if text quote drifted', () => {
    const text = '第一处命中\n上下文A\n重复片段\n中间内容\n重复片段\n目标尾部';
    const firstMatchStart = text.indexOf('重复片段');
    const secondMatchStart = text.indexOf('重复片段', firstMatchStart + 1);

    render(
      <TextPreview
        text={text}
        sourceHighlight={{
          content: '重复片段',
          textQuote: '漂移片段',
          textOffsetStart: secondMatchStart,
          textOffsetEnd: secondMatchStart + '重复片段'.length,
        }}
      />,
    );

    const content = screen.getByTestId('text-preview-content');
    const beforeHighlight = content.firstChild?.textContent ?? '';
    const afterHighlight = content.lastChild?.textContent ?? '';

    expect(beforeHighlight).toContain('中间内容');
    expect(afterHighlight).toContain('目标尾部');
  });

  it('supports back-to-qa action from table source highlight block', () => {
    const onBackToQa = vi.fn();
    render(
      <TablePreview
        sheets={[
          {id: 'sheet-1', name: 'Sheet 1', columns: ['姓名'], rows: [['张三'], ['李四'], ['王五']]},
        ]}
        sourceHighlight={{sheetId: 'sheet-1', rowStart: 1, rowEnd: 2, content: '李四 王五'}}
        onSourceBlockAuxClick={onBackToQa}
      />,
    );

    fireEvent.click(screen.getByTestId('table-preview-source-highlight-back-to-qa'));
    expect(onBackToQa).toHaveBeenCalledTimes(1);
  });
});
