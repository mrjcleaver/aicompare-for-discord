import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VotingInterface } from '../VotingInterface';

// Mock hooks
jest.mock('../../hooks/useVoting', () => ({
  useVoting: jest.fn(() => ({
    submitVote: jest.fn().mockResolvedValue({}),
    votes: {
      'response-1': {
        thumbsUp: 5,
        thumbsDown: 1,
        starRatings: [4, 5, 4, 5, 3],
        averageRating: 4.2
      },
      'response-2': {
        thumbsUp: 3,
        thumbsDown: 0,
        starRatings: [4, 5, 4],
        averageRating: 4.3
      }
    },
    isSubmitting: false,
    userVotes: {
      'response-1': { voteType: 'thumbs_up', value: 1 }
    }
  }))
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(() => ({
    user: globalThis.FrontendTestUtils.mockUser,
    isAuthenticated: true
  }))
}));

describe('VotingInterface Component', () => {
  const user = userEvent.setup();
  const mockComparison = globalThis.FrontendTestUtils.mockComparison;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render voting buttons for each response', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Should have thumbs up/down buttons for each response
      expect(screen.getAllByRole('button', { name: /thumbs up/i })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /thumbs down/i })).toHaveLength(2);
    });

    it('should display current vote counts', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Check vote counts are displayed
      expect(screen.getByText('5')).toBeInTheDocument(); // thumbs up for response-1
      expect(screen.getByText('1')).toBeInTheDocument(); // thumbs down for response-1
      expect(screen.getByText('3')).toBeInTheDocument(); // thumbs up for response-2
    });

    it('should show star ratings for each response', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Should show star rating components
      const starRatings = screen.getAllByTestId('star-rating');
      expect(starRatings).toHaveLength(2);

      // Should display average ratings
      expect(screen.getByText('4.2')).toBeInTheDocument();
      expect(screen.getByText('4.3')).toBeInTheDocument();
    });

    it('should highlight user previous votes', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // First response thumbs up should be highlighted (user voted)
      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      expect(thumbsUpButtons[0]).toHaveClass('voted');
      expect(thumbsUpButtons[1]).not.toHaveClass('voted');
    });
  });

  describe('Vote Submission', () => {
    it('should submit thumbs up vote', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      await user.click(thumbsUpButton);

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'thumbs_up',
        value: 1
      });
    });

    it('should submit thumbs down vote', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsDownButton = screen.getAllByRole('button', { name: /thumbs down/i })[0];
      await user.click(thumbsDownButton);

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'thumbs_down',
        value: 1
      });
    });

    it('should submit star rating vote', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Click on 4-star rating
      const starRating = screen.getAllByTestId('star-rating')[0];
      const fourStarButton = starRating.querySelector('[data-rating="4"]');
      
      if (fourStarButton) {
        await user.click(fourStarButton);
      }

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'star_rating',
        value: 4
      });
    });

    it('should allow vote changes', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {
          'response-1': { voteType: 'thumbs_up', value: 1 }
        }
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // User already voted thumbs up, now click thumbs down
      const thumbsDownButton = screen.getAllByRole('button', { name: /thumbs down/i })[0];
      await user.click(thumbsDownButton);

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-1',
        voteType: 'thumbs_down',
        value: 1
      });
    });
  });

  describe('Loading States', () => {
    it('should disable voting buttons during submission', () => {
      const { useVoting } = await import('../../hooks/useVoting');
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: jest.fn(),
        votes: {},
        isSubmitting: true,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      const thumbsDownButtons = screen.getAllByRole('button', { name: /thumbs down/i });

      thumbsUpButtons.forEach(button => {
        expect(button).toBeDisabled();
      });

      thumbsDownButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should show loading spinner during vote submission', () => {
      const { useVoting } = await import('../../hooks/useVoting');
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: jest.fn(),
        votes: {},
        isSubmitting: true,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      expect(screen.getByTestId('voting-spinner')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when vote fails', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockRejectedValue(new Error('Vote submission failed'));
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {},
        error: 'Vote submission failed'
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      expect(screen.getByText(/vote submission failed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should retry failed vote when retry button is clicked', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      const mockRetry = jest.fn();
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {},
        error: 'Vote submission failed',
        retryLastVote: mockRetry
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      await user.click(retryButton);

      expect(mockRetry).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    it('should show login prompt for unauthenticated users', () => {
      const { useAuth } = await import('../../hooks/useAuth');
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      expect(screen.getByText(/sign in to vote/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should disable voting buttons for unauthenticated users', () => {
      const { useAuth } = await import('../../hooks/useAuth');
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isAuthenticated: false
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      thumbsUpButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render in horizontal layout', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="horizontal"
        />
      );

      const votingContainer = screen.getByTestId('voting-interface');
      expect(votingContainer).toHaveClass('horizontal');
    });

    it('should render in vertical layout', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const votingContainer = screen.getByTestId('voting-interface');
      expect(votingContainer).toHaveClass('vertical');
    });

    it('should adapt button sizes for mobile', () => {
      // Mock mobile screen size
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="horizontal"
        />
      );

      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      expect(thumbsUpButtons[0]).toHaveClass('mobile-size');
    });
  });

  describe('Selected Response Focus', () => {
    it('should highlight selected response voting section', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-2"
          orientation="vertical"
        />
      );

      const votingSections = screen.getAllByTestId('response-voting');
      expect(votingSections[1]).toHaveClass('selected'); // Second response is selected
      expect(votingSections[0]).not.toHaveClass('selected');
    });

    it('should show detailed voting stats for selected response', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Should show breakdown of star ratings for selected response
      expect(screen.getByTestId('detailed-ratings')).toBeInTheDocument();
      expect(screen.getByText('5 stars: 2 votes')).toBeInTheDocument();
      expect(screen.getByText('4 stars: 2 votes')).toBeInTheDocument();
      expect(screen.getByText('3 stars: 1 vote')).toBeInTheDocument();
    });

    it('should allow voting on non-selected responses', async () => {
      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Click on vote button for non-selected response (response-2)
      const votingSections = screen.getAllByTestId('response-voting');
      const response2ThumbsUp = votingSections[1].querySelector('button[aria-label*="thumbs up"]');
      
      if (response2ThumbsUp) {
        await user.click(response2ThumbsUp);
      }

      expect(mockSubmitVote).toHaveBeenCalledWith({
        responseId: 'response-2',
        voteType: 'thumbs_up',
        value: 1
      });
    });
  });

  describe('Vote Statistics', () => {
    it('should display vote participation rate', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Should show how many users have voted
      expect(screen.getByText(/6 users voted/i)).toBeInTheDocument(); // 5 thumbs up + 1 thumbs down
    });

    it('should show vote confidence indicators', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Should show confidence level based on vote distribution
      expect(screen.getByTestId('vote-confidence')).toBeInTheDocument();
      expect(screen.getByText(/high confidence/i)).toBeInTheDocument(); // 83% positive votes
    });

    it('should display trend indicators for vote changes', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      // Mock showing recent vote trend
      expect(screen.getByTestId('vote-trend')).toBeInTheDocument();
      expect(screen.getByTitle(/votes trending up/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for vote buttons', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButtons = screen.getAllByRole('button', { name: /thumbs up/i });
      expect(thumbsUpButtons[0]).toHaveAttribute('aria-label', 
        expect.stringContaining('Vote thumbs up for GPT-4 response')
      );
    });

    it('should announce vote changes to screen readers', async () => {
      const announceSpy = jest.spyOn(globalThis.FrontendTestUtils, 'announceToScreenReader').mockImplementation(() => {});

      const { useVoting } = await import('../../hooks/useVoting');
      const mockSubmitVote = jest.fn().mockResolvedValue({});
      (useVoting as jest.Mock).mockReturnValue({
        submitVote: mockSubmitVote,
        votes: {},
        isSubmitting: false,
        userVotes: {}
      });

      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      await user.click(thumbsUpButton);

      await waitFor(() => {
        expect(announceSpy).toHaveBeenCalledWith(
          expect.stringContaining('Voted thumbs up for GPT-4 response')
        );
      });
    });

    it('should support keyboard navigation', async () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      thumbsUpButton.focus();

      await user.keyboard('{Enter}');
      // Should submit vote via keyboard
      expect(thumbsUpButton).toHaveFocus();
    });

    it('should have proper focus indicators', () => {
      globalThis.FrontendTestUtils.renderWithProviders(
        <VotingInterface 
          comparison={mockComparison} 
          selectedResponse="response-1"
          orientation="vertical"
        />
      );

      const thumbsUpButton = screen.getAllByRole('button', { name: /thumbs up/i })[0];
      thumbsUpButton.focus();

      expect(thumbsUpButton).toHaveClass('focus-visible');
    });
  });
});