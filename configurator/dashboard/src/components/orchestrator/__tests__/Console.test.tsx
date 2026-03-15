// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Console, type ConsoleSize } from '../Console';

describe('Console', () => {
  const mockOutput = [
    'Plain text output',
    '\x1b[31mRed error message\x1b[0m',
    '\x1b[32mGreen success message\x1b[0m',
    '\x1b[1mBold text\x1b[0m',
    '\x1b[3mItalic text\x1b[0m',
  ];

  describe('Rendering', () => {
    it('should render empty state when no output', () => {
      render(<Console output={[]} />);
      expect(screen.getByText(/console output will appear here/i)).toBeInTheDocument();
    });

    it('should render output lines', () => {
      render(<Console output={['Line 1', 'Line 2', 'Line 3']} />);
      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Line 2')).toBeInTheDocument();
      expect(screen.getByText('Line 3')).toBeInTheDocument();
    });

    it('should render in minimal mode without header', () => {
      render(<Console output={['Test']} minimal />);
      expect(screen.queryByText('Console Output')).not.toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should render with header in full mode', () => {
      render(<Console output={['Test']} minimal={false} />);
      expect(screen.getByText('Console Output')).toBeInTheDocument();
    });
  });

  describe('Size Management', () => {
    it('should apply correct size styles', () => {
      const { container, rerender } = render(<Console output={['Test']} size="sm" minimal />);
      let outputDiv = container.querySelector('.h-\\[200px\\]');
      expect(outputDiv).toBeInTheDocument();

      rerender(<Console output={['Test']} size="md" minimal />);
      outputDiv = container.querySelector('.h-\\[300px\\]');
      expect(outputDiv).toBeInTheDocument();

      rerender(<Console output={['Test']} size="lg" minimal />);
      outputDiv = container.querySelector('.h-\\[450px\\]');
      expect(outputDiv).toBeInTheDocument();
    });

    it('should call onSizeChange when size buttons are clicked', async () => {
      const user = userEvent.setup();
      const handleSizeChange = vi.fn();

      render(
        <Console
          output={['Test']}
          size="md"
          onSizeChange={handleSizeChange}
          minimal={false}
        />
      );

      const smButton = screen.getByText('SM');
      await user.click(smButton);
      expect(handleSizeChange).toHaveBeenCalledWith('sm');

      const lgButton = screen.getByText('LG');
      await user.click(lgButton);
      expect(handleSizeChange).toHaveBeenCalledWith('lg');
    });
  });

  describe('ANSI Code Parsing', () => {
    it('should parse and render ANSI color codes', () => {
      render(<Console output={['\x1b[31mRed text\x1b[0m']} minimal />);
      const textElement = screen.getByText('Red text');
      expect(textElement).toHaveStyle({ color: '#ff5f5f' });
    });

    it('should parse bold ANSI codes', () => {
      render(<Console output={['\x1b[1mBold text\x1b[0m']} minimal />);
      const textElement = screen.getByText('Bold text');
      expect(textElement).toHaveStyle({ fontWeight: 'bold' });
    });

    it('should parse italic ANSI codes', () => {
      render(<Console output={['\x1b[3mItalic text\x1b[0m']} minimal />);
      const textElement = screen.getByText('Italic text');
      expect(textElement).toHaveStyle({ fontStyle: 'italic' });
    });

    it('should parse underline ANSI codes', () => {
      render(<Console output={['\x1b[4mUnderlined text\x1b[0m']} minimal />);
      const textElement = screen.getByText('Underlined text');
      expect(textElement).toHaveStyle({ textDecoration: 'underline' });
    });

    it('should parse multiple ANSI codes', () => {
      render(<Console output={['\x1b[1m\x1b[31mBold red text\x1b[0m']} minimal />);
      const textElement = screen.getByText('Bold red text');
      expect(textElement).toHaveStyle({
        fontWeight: 'bold',
        color: '#ff5f5f'
      });
    });

    it('should reset styles with ANSI reset code', () => {
      render(<Console output={['\x1b[31mRed\x1b[0m Normal']} minimal />);
      expect(screen.getByText('Red')).toBeInTheDocument();
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });
  });

  describe('XSS Sanitization', () => {
    it('should sanitize HTML tags to prevent XSS', () => {
      const maliciousOutput = ['<script>alert("XSS")</script>'];
      render(<Console output={maliciousOutput} minimal />);

      // React escapes text content, so the script tag is rendered as visible text
      // This is correct XSS prevention - the script is NOT executed as HTML
      const sanitized = screen.getByText(/script/i);

      // The text content SHOULD show the script as text (this proves it's escaped)
      expect(sanitized.textContent).toContain('<script>');
      expect(sanitized.textContent).toContain('alert');

      // The innerHTML should contain the escaped version, NOT executable HTML
      // React escapes < and > so they render as text, not as HTML tags
      expect(sanitized.innerHTML).not.toMatch(/<script[^&]/); // Not actual HTML tag
    });

    it('should sanitize special characters', () => {
      const output = ['<div>Test & "quotes" \'apostrophes\'</div>'];
      render(<Console output={output} minimal />);

      const element = screen.getByText(/Test/);
      // Text content should be readable
      expect(element.textContent).toContain('Test');
      expect(element.textContent).toContain('&');

      // HTML should not contain executable tags
      expect(element.innerHTML).not.toContain('<div>');
      // The content is double-escaped due to React rendering
      expect(element.innerHTML).toMatch(/&(amp;)?lt;div&(amp;)?gt;/);
    });

    it('should sanitize event handlers', () => {
      const output = ['<img src=x onerror="alert(1)">'];
      render(<Console output={output} minimal />);

      const element = screen.getByText(/img/);
      // Text should be visible
      expect(element.textContent).toContain('img');
      expect(element.textContent).toContain('onerror');

      // But not as executable HTML
      expect(element.innerHTML).not.toContain('<img');
      const container = element.closest('div');
      const imgTags = container?.getElementsByTagName('img');
      expect(imgTags?.length || 0).toBe(0);
    });

    it('should handle ANSI codes and sanitization together', () => {
      const output = ['\x1b[31m<script>alert("XSS")</script>\x1b[0m'];
      render(<Console output={output} minimal />);

      const element = screen.getByText(/script/);
      // Text should be visible and sanitized
      expect(element.textContent).toContain('script');
      expect(element.innerHTML).not.toContain('<script>alert');

      // Should have color from ANSI code
      expect(element).toHaveStyle({ color: '#ff5f5f' });
    });
  });

  describe('Auto-scroll Behavior', () => {
    beforeEach(() => {
      // Mock scrollIntoView
      Element.prototype.scrollIntoView = vi.fn();
    });

    it('should auto-scroll when new output is added', () => {
      const { rerender } = render(<Console output={['Line 1']} minimal />);

      rerender(<Console output={['Line 1', 'Line 2']} minimal />);

      // Test is primarily about not throwing errors during scroll
      expect(screen.getByText('Line 2')).toBeInTheDocument();
    });

    it('should handle scroll events', () => {
      const { container } = render(
        <Console output={mockOutput} minimal />
      );

      const scrollContainer = container.querySelector('[class*="overflow-auto"]');
      expect(scrollContainer).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long output lines', () => {
      const longLine = 'A'.repeat(10000);
      render(<Console output={[longLine]} minimal />);

      expect(screen.getByText(longLine)).toBeInTheDocument();
    });

    it('should handle empty strings in output', () => {
      render(<Console output={['', 'text', '']} minimal />);
      expect(screen.getByText('text')).toBeInTheDocument();
    });

    it('should handle special whitespace characters', () => {
      render(<Console output={['Line with\ttabs', 'Line with\nnewlines']} minimal />);
      expect(screen.getByText(/tabs/)).toBeInTheDocument();
      expect(screen.getByText(/newlines/)).toBeInTheDocument();
    });

    it('should handle malformed ANSI codes gracefully', () => {
      const malformed = ['\x1b[999mInvalid code\x1b[0m'];
      render(<Console output={malformed} minimal />);

      expect(screen.getByText('Invalid code')).toBeInTheDocument();
    });

    it('should handle custom className', () => {
      const { container } = render(
        <Console output={['Test']} className="custom-class" minimal />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render large number of output lines', () => {
      const largeOutput = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);
      render(<Console output={largeOutput} minimal />);

      // Verify first and last lines are present
      expect(screen.getByText('Line 0')).toBeInTheDocument();
      expect(screen.getByText('Line 999')).toBeInTheDocument();
    });

    it('should handle rapid output updates', () => {
      const { rerender } = render(<Console output={['Initial']} minimal />);

      for (let i = 0; i < 10; i++) {
        rerender(<Console output={[`Update ${i}`]} minimal />);
      }

      expect(screen.getByText('Update 9')).toBeInTheDocument();
    });
  });
});
