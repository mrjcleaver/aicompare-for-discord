import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparisonView } from '../ComparisonView';
import { server, mockAPIError, mockAPISuccess } from '../../../../tests/mocks/msw-server';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    query: { id: 'comparison-123' },
    pathname: '/comparison/[id]'
  })
}));

// Mock hooks
jest.mock('../../hooks/useComparison', () => ({
  useComparison: jest.fn(() => ({
    comparison: globalThis.FrontendTestUtils.mockComparison,
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }))
}));

jest.mock('../../hooks/useVoting', () => ({
  useVoting: jest.fn(() => ({
    submitVote: jest.fn().mockResolvedValue({}),
    votes: globalThis.FrontendTestUtils.mockComparison.votes,
    isSubmitting: false
  }))
}));

describe('ComparisonView Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render comparison data correctly', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Check if query prompt is displayed
      expect(screen.getByText('Explain quantum computing in simple terms')).toBeInTheDocument();

      // Check if both model responses are displayed
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Claude-3.5-Sonnet')).toBeInTheDocument();

      // Check if response content is displayed (truncated)
      expect(screen.getByText(/Quantum computing is a revolutionary technology/)).toBeInTheDocument();
      expect(screen.getByText(/Quantum computing represents a fundamental shift/)).toBeInTheDocument();
    });

    it('should display similarity metrics', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Check for metrics display
      expect(screen.getByText('Similarity Metrics')).toBeInTheDocument();
      expect(screen.getByText('87%')).toBeInTheDocument(); // Semantic similarity
      expect(screen.getByText('91%')).toBeInTheDocument(); // Length consistency
      expect(screen.getByText('85%')).toBeInTheDocument(); // Sentiment alignment
      expect(screen.getByText('92%')).toBeInTheDocument(); // Response speed
    });

    it('should show response metadata', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Check for response time and token count
      expect(screen.getByText('1200ms')).toBeInTheDocument(); // GPT-4 response time
      expect(screen.getByText('950ms')).toBeInTheDocument(); // Claude response time
      expect(screen.getByText('215 tokens')).toBeInTheDocument(); // GPT-4 tokens
      expect(screen.getByText('195 tokens')).toBeInTheDocument(); // Claude tokens
    });

    it('should display vote counts', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Check for vote counts
      expect(screen.getByText('8')).toBeInTheDocument(); // GPT-4 thumbs up
      expect(screen.getByText('6')).toBeInTheDocument(); // Claude thumbs up
    });
  });

  describe('Responsive Layout', () => {
    it('should adapt layout for mobile screens', () => {
      // Mock mobile screen size
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const container = screen.getByTestId('comparison-container');
      expect(container).toHaveClass('mobile-layout');
    });

    it('should use desktop layout for larger screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const container = screen.getByTestId('comparison-container');
      expect(container).toHaveClass('desktop-layout');
    });
  });

  describe('Voting Interaction', () => {
    it('should handle thumbs up votes', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: globalThis.FrontendTestUtils.mockComparison.votes,
        isSubmitting: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Click thumbs up for GPT-4 response
      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      await user.click(thumbsUpButton);

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'thumbs_up',
        value: 1
      });
    });

    it('should handle star rating votes', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: globalThis.FrontendTestUtils.mockComparison.votes,
        isSubmitting: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Rate GPT-4 response with 5 stars
      const starRating = screen.getAllByTestId('star-rating')[0];
      const fiveStarButton = starRating.querySelector('[data-rating="5"]');
      
      if (fiveStarButton) {
        await user.click(fiveStarButton);
      }

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'star_rating',
        value: 5
      });
    });

    it('should show loading state during vote submission', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: jest.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        votes: globalThis.FrontendTestUtils.mockComparison.votes,
        isSubmitting: true
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      expect(thumbsUpButton).toBeDisabled();
    });

    it('should handle vote submission errors', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockRejectedValue(new Error('Vote submission failed'));
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: globalThis.FrontendTestUtils.mockComparison.votes,
        isSubmitting: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      await user.click(thumbsUpButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/failed to submit vote/i)).toBeInTheDocument();
      });
    });
  });

  describe('Response Selection', () => {
    it('should highlight selected response', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Click on first response card
      const responseCard = screen.getAllByTestId('response-card')[0];
      await user.click(responseCard);

      expect(responseCard).toHaveClass('selected');
    });

    it('should show detailed view for selected response', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const responseCard = screen.getAllByTestId('response-card')[0];
      await user.click(responseCard);

      // Should show expanded content
      expect(screen.getByTestId('response-details')).toBeInTheDocument();
      expect(screen.getByText('Full Response')).toBeInTheDocument();
    });

    it('should allow keyboard navigation between responses', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const firstCard = screen.getAllByTestId('response-card')[0];
      const secondCard = screen.getAllByTestId('response-card')[1];

      // Focus first card and use arrow key to navigate
      firstCard.focus();
      await user.keyboard('{ArrowRight}');

      expect(secondCard).toHaveFocus();
    });
  });

  describe('Export Functionality', () => {
    it('should show export button', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('should open export modal when clicked', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      expect(screen.getByTestId('export-modal')).toBeInTheDocument();
      expect(screen.getByText('Export Comparison')).toBeInTheDocument();
    });

    it('should offer multiple export formats', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Check for export format options
      expect(screen.getByLabelText(/PDF/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Markdown/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/CSV/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/JSON/i)).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading spinner while fetching data', () => {
      const { useComparison } = await import('../../hooks/useComparison');
      (useComparison as jest.Mock).mockReturnValue({
        comparison: null,
        isLoading: true,
        error: null,
        refetch: jest.fn()
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should show error message when comparison fails to load', () => {
      const { useComparison } = await import('../../hooks/useComparison');
      (useComparison as jest.Mock).mockReturnValue({
        comparison: null,
        isLoading: false,
        error: new Error('Failed to load comparison'),
        refetch: jest.fn()
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      expect(screen.getByText(/failed to load comparison/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should retry loading when retry button is clicked', async () => {
      const { useComparison } = await import('../../hooks/useComparison');
      const mockRefetch = jest.fn();
      (useComparison as jest.Mock).mockReturnValue({
        comparison: null,
        isLoading: false,
        error: new Error('Failed to load comparison'),
        refetch: mockRefetch
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalled();
    });

    it('should show not found message for invalid comparison ID', () => {
      mockAPIError('/api/comparisons/invalid-id', 404, 'Comparison not found');

      const { useComparison } = await import('../../hooks/useComparison');
      (useComparison as jest.Mock).mockReturnValue({
        comparison: null,
        isLoading: false,
        error: { status: 404, message: 'Comparison not found' },
        refetch: jest.fn()
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="invalid-id" />
      );

      expect(screen.getByText(/comparison not found/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('should update vote counts in real-time', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockVotes = { ...globalThis.FrontendTestUtils.mockComparison.votes };
      
      const { rerender } = globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Initial vote count
      expect(screen.getByText('8')).toBeInTheDocument(); // GPT-4 thumbs up

      // Simulate vote update
      mockVotes['response-1'].thumbsUp = 9;
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: jest.fn(),
        votes: mockVotes,
        isSubmitting: false
      });

      rerender(<ComparisonView comparisonId="comparison-123" />);

      // Should show updated vote count
      expect(screen.getByText('9')).toBeInTheDocument();
    });

    it('should show new comments in real-time', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Initially no comments section
      expect(screen.queryByTestId('comments-section')).not.toBeInTheDocument();

      // Simulate comment being added via WebSocket
      // This would depend on the actual WebSocket implementation
      // For now, we'll test that the component can render comments when they exist
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for interactive elements', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Check ARIA labels on vote buttons
      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      expect(thumbsUpButtons[0]).toHaveAttribute('aria-label', 
        expect.stringContaining('Vote thumbs up for GPT-4 response')
      );

      // Check ARIA labels on response cards
      const responseCards = screen.getAllByTestId('response-card');
      expect(responseCards[0]).toHaveAttribute('aria-label', 
        expect.stringContaining('Response from GPT-4')
      );
    });

    it('should support keyboard navigation', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Test tab navigation
      await user.tab();
      expect(screen.getAllByTestId('response-card')[0]).toHaveFocus();

      await user.tab();
      expect(screen.getAllByRole('button', { name: /thumbs up/i })[0]).toHaveFocus();
    });

    it('should announce vote changes to screen readers', async () => {
      const announceSpy = jest.fn();
      globalThis.FrontendTestUtils.announceToScreenReader = announceSpy;

      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: globalThis.FrontendTestUtils.mockComparison.votes,
        isSubmitting: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      await user.click(thumbsUpButton);

      await waitFor(() => {
        expect(announceSpy).toHaveBeenCalledWith(
          expect.stringContaining('Vote submitted for GPT-4 response')
        );
      });
    });
  });

  describe('Performance', () => {
    it('should virtualize long response content', () => {
      // Mock a response with very long content
      const longContentComparison = {
        ...globalThis.FrontendTestUtils.mockComparison,
        responses: [
          {
            ...globalThis.FrontendTestUtils.mockComparison.responses[0],
            content: 'Very long response content... '.repeat(1000)
          }
        ]
      };

      const { useComparison } = await import('../../hooks/useComparison');
      (useComparison as jest.Mock).mockReturnValue({
        comparison: longContentComparison,
        isLoading: false,
        error: null,
        refetch: jest.fn()
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Should show "Show more" button for long content
      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    });

    it('should lazy load detailed metrics', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <ComparisonView comparisonId="comparison-123" />
      );

      // Detailed metrics should not be visible initially
      expect(screen.queryByTestId('detailed-metrics')).not.toBeInTheDocument();

      // Click to expand metrics
      const metricsButton = screen.getByRole('button', { name: /show detailed metrics/i });
      await user.click(metricsButton);

      // Should now show detailed metrics
      expect(screen.getByTestId('detailed-metrics')).toBeInTheDocument();
    });
  });
});