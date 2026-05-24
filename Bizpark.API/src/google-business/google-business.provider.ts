export type GoogleBusinessLocation = {
  name: string;
  title: string;
  address: string;
  verified: boolean;
};

export type GoogleBusinessReview = {
  name: string;
  reviewId: string;
  reviewerDisplayName: string | null;
  reviewerIsAnonymous: boolean;
  rating: number;
  comment: string | null;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime?: string } | null;
};

export interface GoogleBusinessProvider {
  provider: 'mock' | 'real';
  listLocations(businessId: string): Promise<GoogleBusinessLocation[]>;
  listReviews(locationName: string): Promise<GoogleBusinessReview[]>;
  replyToReview(reviewName: string, replyText: string): Promise<{ comment: string; updateTime: string }>;
}

const now = () => new Date().toISOString();

export class MockGoogleBusinessProvider implements GoogleBusinessProvider {
  provider = 'mock' as const;

  async listLocations(businessId: string): Promise<GoogleBusinessLocation[]> {
    return [
      {
        name: `accounts/mock-account/locations/${businessId}-main`,
        title: 'BizSpark Demo Cafe',
        address: '42 Market Street, Colombo',
        verified: true,
      },
      {
        name: `accounts/mock-account/locations/${businessId}-studio`,
        title: 'BizSpark Demo Studio',
        address: '18 Lake Road, Colombo',
        verified: true,
      },
    ];
  }

  async listReviews(locationName: string): Promise<GoogleBusinessReview[]> {
    return [
      {
        name: `${locationName}/reviews/mock-five-star`,
        reviewId: 'mock-five-star',
        reviewerDisplayName: 'Ayesha Fernando',
        reviewerIsAnonymous: false,
        rating: 5,
        comment: 'Fantastic service and very friendly staff. I will definitely come back.',
        createTime: '2026-05-01T08:30:00Z',
        updateTime: '2026-05-01T08:30:00Z',
      },
      {
        name: `${locationName}/reviews/mock-four-star`,
        reviewId: 'mock-four-star',
        reviewerDisplayName: 'Nimal Perera',
        reviewerIsAnonymous: false,
        rating: 4,
        comment: 'Great experience overall. The waiting time was a little long but the quality was excellent.',
        createTime: '2026-05-02T11:15:00Z',
        updateTime: '2026-05-02T11:15:00Z',
      },
      {
        name: `${locationName}/reviews/mock-two-star`,
        reviewId: 'mock-two-star',
        reviewerDisplayName: 'Anonymous',
        reviewerIsAnonymous: true,
        rating: 2,
        comment: 'The team was polite, but my order was delayed and nobody updated me.',
        createTime: '2026-05-03T15:45:00Z',
        updateTime: '2026-05-03T15:45:00Z',
      },
      {
        name: `${locationName}/reviews/mock-rating-only`,
        reviewId: 'mock-rating-only',
        reviewerDisplayName: null,
        reviewerIsAnonymous: true,
        rating: 5,
        comment: null,
        createTime: '2026-05-04T09:00:00Z',
        updateTime: '2026-05-04T09:00:00Z',
      },
    ];
  }

  async replyToReview(_reviewName: string, replyText: string) {
    return { comment: replyText, updateTime: now() };
  }
}

export class RealGoogleBusinessProvider implements GoogleBusinessProvider {
  provider = 'real' as const;

  async listLocations(): Promise<GoogleBusinessLocation[]> {
    throw new Error('Real Google Business Profile provider is not configured yet. Use GOOGLE_BUSINESS_PROVIDER=mock for local testing.');
  }

  async listReviews(): Promise<GoogleBusinessReview[]> {
    throw new Error('Real Google Business Profile provider is not configured yet. Use GOOGLE_BUSINESS_PROVIDER=mock for local testing.');
  }

  async replyToReview(): Promise<{ comment: string; updateTime: string }> {
    throw new Error('Real Google Business Profile provider is not configured yet. Use GOOGLE_BUSINESS_PROVIDER=mock for local testing.');
  }
}

export const createGoogleBusinessProvider = (): GoogleBusinessProvider => {
  return process.env.GOOGLE_BUSINESS_PROVIDER === 'real'
    ? new RealGoogleBusinessProvider()
    : new MockGoogleBusinessProvider();
};
