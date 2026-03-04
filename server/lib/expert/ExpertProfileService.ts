import { db } from '@db';
import {
  expertProfiles,
  cloneCoreIdentity,
  clientMemoryVaults,
  clonePerformanceMetrics,
  cloneHires,
  cloneRatings
} from '@db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface CreateExpertProfileRequest {
  userId: number;
  displayName: string;
  bio?: string;
  title: string;
  primaryExpertise: string;
  skills?: string[];
  industries?: string[];
  languages?: string[];
  basePrice: number;
  whatsappNumber?: string;
  linkedinUrl?: string;
  email?: string;
}

export interface UpdateExpertProfileRequest {
  displayName?: string;
  bio?: string;
  longDescription?: string;
  avatar?: string;
  coverImage?: string;
  title?: string;
  skills?: string[];
  industries?: string[];
  languages?: string[];
  yearsOfExperience?: number;
  basePrice?: string;
  pricingModel?: 'per_hour' | 'per_task' | 'monthly_subscription' | 'custom';
  customPricingTiers?: any[];
  whatsappNumber?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  email?: string;
  isPublic?: boolean;
  metadata?: any;
}

/**
 * Expert Profile Service
 * 
 * Manages expert profiles, clone training, and marketplace listings.
 * Enables experts to create AI clones of themselves that companies can hire.
 */
export class ExpertProfileService {
  
  /**
   * Create a new expert profile
   */
  static async createProfile(request: CreateExpertProfileRequest): Promise<any> {
    try {
      const { userId, displayName, bio, title, primaryExpertise, skills, industries, languages, basePrice, whatsappNumber, linkedinUrl, email } = request;
      
      // Generate unique short code
      const shortCode = this.generateShortCode(displayName, primaryExpertise);
      const profileUrl = `${process.env.VITE_APP_URL || 'https://yourdomain.com'}/experts/${shortCode}`;
      
      // Create expert profile
      const [profile] = await db.insert(expertProfiles).values({
        userId,
        displayName,
        bio: bio || '',
        title,
        primaryExpertise,
        skills: skills || [],
        industries: industries || [],
        languages: languages || ['en'],
        basePrice: basePrice.toString(),
        currentPrice: basePrice.toString(),
        whatsappNumber,
        linkedinUrl,
        email,
        shortCode,
        profileUrl,
        status: 'draft'
      }).returning();
      
      // Create initial clone core identity
      await db.insert(cloneCoreIdentity).values({
        expertProfileId: profile.id,
        knowledgeBase: {},
        communicationStyle: {},
        personality: {},
        reasoningPatterns: {},
        modelConfig: {}
      });
      
      // Create initial performance metrics
      await db.insert(clonePerformanceMetrics).values({
        expertProfileId: profile.id,
        period: 'all_time'
      });
      
      console.log(`[ExpertProfile] Created profile ${profile.id} for user ${userId}: ${displayName}`);
      
      return {
        id: profile.id,
        shortCode: profile.shortCode,
        profileUrl: profile.profileUrl,
        status: profile.status
      };
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error creating profile:', error);
      throw new Error(`Failed to create expert profile: ${error.message}`);
    }
  }
  
  /**
   * Get expert profile by ID
   */
  static async getProfile(profileId: number, includePrivate: boolean = false): Promise<any> {
    try {
      const [profile] = await db.select()
        .from(expertProfiles)
        .where(eq(expertProfiles.id, profileId))
        .limit(1);
      
      if (!profile) {
        throw new Error('Expert profile not found');
      }
      
      // Get performance metrics
      const [metrics] = await db.select()
        .from(clonePerformanceMetrics)
        .where(and(
          eq(clonePerformanceMetrics.expertProfileId, profileId),
          eq(clonePerformanceMetrics.period, 'all_time')
        ))
        .limit(1);
      
      // Get recent ratings
      const ratings = await db.select()
        .from(cloneRatings)
        .where(eq(cloneRatings.expertProfileId, profileId))
        .orderBy(desc(cloneRatings.createdAt))
        .limit(5);
      
      const publicData = {
        id: profile.id,
        displayName: profile.displayName,
        bio: profile.bio,
        longDescription: profile.longDescription,
        avatar: profile.avatar,
        coverImage: profile.coverImage,
        title: profile.title,
        primaryExpertise: profile.primaryExpertise,
        skills: profile.skills,
        industries: profile.industries,
        languages: profile.languages,
        yearsOfExperience: profile.yearsOfExperience,
        rating: parseFloat(profile.rating || "0"),
        totalHires: profile.totalHires,
        totalTasks: profile.totalTasks,
        successRate: parseFloat(profile.successRate || "0"),
        averageResponseTime: profile.averageResponseTime,
        currentPrice: parseFloat(profile.currentPrice || "0"),
        pricingModel: profile.pricingModel,
        customPricingTiers: profile.customPricingTiers,
        whatsappNumber: profile.whatsappNumber,
        linkedinUrl: profile.linkedinUrl,
        websiteUrl: profile.websiteUrl,
        email: profile.email,
        status: profile.status,
        isFeatured: profile.isFeatured,
        shortCode: profile.shortCode,
        profileUrl: profile.profileUrl,
        metadata: profile.metadata,
        createdAt: profile.createdAt,
        publishedAt: profile.publishedAt,
        lastActiveAt: profile.lastActiveAt,
        performance: metrics ? {
          totalInteractions: metrics.totalInteractions,
          totalTasksCompleted: metrics.totalTasksCompleted,
          averageRating: parseFloat(metrics.averageRating || "0"),
          taskSuccessRate: parseFloat(metrics.taskSuccessRate || "0"),
          clientSatisfactionScore: parseFloat(metrics.clientSatisfactionScore || "0")
        } : null,
        recentRatings: ratings.map(r => ({
          rating: r.overallRating,
          reviewTitle: r.reviewTitle,
          reviewText: r.isPublic ? r.reviewText : null,
          createdAt: r.createdAt
        }))
      };
      
      if (includePrivate) {
        return {
          ...publicData,
          userId: profile.userId,
          platformFeePercentage: parseFloat(profile.platformFeePercentage || "0"),
          expertEarningsTotal: parseFloat(profile.expertEarningsTotal || "0"),
          platformEarningsTotal: parseFloat(profile.platformEarningsTotal || "0")
        };
      }
      
      return publicData;
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error getting profile:', error);
      throw error;
    }
  }
  
  /**
   * Get expert profile by short code
   */
  static async getProfileByShortCode(shortCode: string): Promise<any> {
    try {
      const [profile] = await db.select()
        .from(expertProfiles)
        .where(eq(expertProfiles.shortCode, shortCode))
        .limit(1);
      
      if (!profile) {
        throw new Error('Expert profile not found');
      }
      
      return this.getProfile(profile.id, false);
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error getting profile by short code:', error);
      throw error;
    }
  }
  
  /**
   * Update expert profile
   */
  static async updateProfile(profileId: number, updates: UpdateExpertProfileRequest): Promise<void> {
    try {
      const updateData: any = {};
      
      if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
      if (updates.bio !== undefined) updateData.bio = updates.bio;
      if (updates.longDescription !== undefined) updateData.longDescription = updates.longDescription;
      if (updates.avatar !== undefined) updateData.avatar = updates.avatar;
      if (updates.coverImage !== undefined) updateData.coverImage = updates.coverImage;
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.skills !== undefined) updateData.skills = updates.skills;
      if (updates.industries !== undefined) updateData.industries = updates.industries;
      if (updates.languages !== undefined) updateData.languages = updates.languages;
      if (updates.yearsOfExperience !== undefined) updateData.yearsOfExperience = updates.yearsOfExperience;
      if (updates.basePrice !== undefined) {
        updateData.basePrice = updates.basePrice;
        updateData.currentPrice = updates.basePrice;
      }
      if (updates.pricingModel !== undefined) updateData.pricingModel = updates.pricingModel;
      if (updates.customPricingTiers !== undefined) updateData.customPricingTiers = updates.customPricingTiers;
      if (updates.whatsappNumber !== undefined) updateData.whatsappNumber = updates.whatsappNumber;
      if (updates.linkedinUrl !== undefined) updateData.linkedinUrl = updates.linkedinUrl;
      if (updates.websiteUrl !== undefined) updateData.websiteUrl = updates.websiteUrl;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
      
      updateData.updatedAt = new Date();
      
      await db.update(expertProfiles)
        .set(updateData)
        .where(eq(expertProfiles.id, profileId));
      
      console.log(`[ExpertProfile] Updated profile ${profileId}`);
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error updating profile:', error);
      throw error;
    }
  }
  
  /**
   * Publish expert profile (make it public)
   */
  static async publishProfile(profileId: number): Promise<void> {
    try {
      await db.update(expertProfiles)
        .set({
          status: 'active',
          isPublic: true,
          publishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(expertProfiles.id, profileId));
      
      console.log(`[ExpertProfile] Published profile ${profileId}`);
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error publishing profile:', error);
      throw error;
    }
  }
  
  /**
   * List all public expert profiles (marketplace)
   */
  static async listPublicProfiles(filters?: {
    expertise?: string;
    industry?: string;
    language?: string;
    minRating?: number;
    maxPrice?: number;
    featured?: boolean;
  }): Promise<any[]> {
    try {
      let query = db.select()
        .from(expertProfiles)
        .where(and(
          eq(expertProfiles.isPublic, true),
          eq(expertProfiles.status, 'active')
        ))
        .orderBy(desc(expertProfiles.isFeatured), desc(expertProfiles.rating));
      
      const profiles = await query;
      
      // Apply filters (in-memory for MVP, move to SQL for production)
      let filtered = profiles;
      
      if (filters?.expertise) {
        filtered = filtered.filter(p => p.primaryExpertise === filters.expertise);
      }
      
      if (filters?.industry && filters.industry.length > 0) {
        filtered = filtered.filter(p => (p.industries as string[])?.includes(filters.industry!));
      }
      
      if (filters?.language) {
        filtered = filtered.filter(p => (p.languages as string[])?.includes(filters.language!));
      }
      
      if (filters?.minRating) {
        filtered = filtered.filter(p => parseFloat(p.rating || "0") >= filters.minRating!);
      }
      
      if (filters?.maxPrice) {
        filtered = filtered.filter(p => parseFloat(p.currentPrice || "0") <= filters.maxPrice!);
      }
      
      if (filters?.featured !== undefined) {
        filtered = filtered.filter(p => p.isFeatured === filters.featured);
      }
      
      return filtered.map(p => ({
        id: p.id,
        displayName: p.displayName,
        bio: p.bio,
        avatar: p.avatar,
        title: p.title,
        primaryExpertise: p.primaryExpertise,
        skills: p.skills,
        industries: p.industries,
        rating: parseFloat(p.rating || "0"),
        totalHires: p.totalHires,
        successRate: parseFloat(p.successRate || "0"),
        currentPrice: parseFloat(p.currentPrice || "0"),
        pricingModel: p.pricingModel,
        isFeatured: p.isFeatured,
        shortCode: p.shortCode,
        profileUrl: p.profileUrl
      }));
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error listing profiles:', error);
      throw error;
    }
  }
  
  /**
   * Get profiles by user ID (expert's own profiles)
   */
  static async getProfilesByUser(userId: number): Promise<any[]> {
    try {
      const profiles = await db.select()
        .from(expertProfiles)
        .where(eq(expertProfiles.userId, userId));
      
      return profiles.map(p => ({
        id: p.id,
        displayName: p.displayName,
        title: p.title,
        status: p.status,
        isPublic: p.isPublic,
        rating: parseFloat(p.rating || "0"),
        totalHires: p.totalHires,
        expertEarningsTotal: parseFloat(p.expertEarningsTotal || "0"),
        shortCode: p.shortCode,
        profileUrl: p.profileUrl,
        createdAt: p.createdAt,
        publishedAt: p.publishedAt
      }));
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error getting profiles by user:', error);
      throw error;
    }
  }
  
  /**
   * Generate unique short code for profile
   */
  private static generateShortCode(name: string, expertise: string): string {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const cleanExpertise = expertise.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const random = Math.random().toString(36).substr(2, 4);
    return `${cleanName}_${cleanExpertise}_${random}`;
  }
  
  /**
   * Update profile performance metrics
   */
  static async updatePerformanceMetrics(profileId: number, updates: {
    totalInteractions?: number;
    totalTasksCompleted?: number;
    averageRating?: number;
    taskSuccessRate?: number;
  }): Promise<void> {
    try {
      const updateData: any = {};
      
      if (updates.totalInteractions !== undefined) {
        updateData.totalInteractions = sql`${clonePerformanceMetrics.totalInteractions} + ${updates.totalInteractions}`;
      }
      if (updates.totalTasksCompleted !== undefined) {
        updateData.totalTasksCompleted = sql`${clonePerformanceMetrics.totalTasksCompleted} + ${updates.totalTasksCompleted}`;
      }
      if (updates.averageRating !== undefined) {
        updateData.averageRating = updates.averageRating.toString();
      }
      if (updates.taskSuccessRate !== undefined) {
        updateData.taskSuccessRate = updates.taskSuccessRate.toString();
      }
      
      updateData.updatedAt = new Date();
      
      await db.update(clonePerformanceMetrics)
        .set(updateData)
        .where(and(
          eq(clonePerformanceMetrics.expertProfileId, profileId),
          eq(clonePerformanceMetrics.period, 'all_time')
        ));
      
      // Also update profile-level metrics
      await db.update(expertProfiles)
        .set({
          rating: updates.averageRating ? updates.averageRating.toString() : undefined,
          totalTasks: updates.totalTasksCompleted ? sql`${expertProfiles.totalTasks} + ${updates.totalTasksCompleted}` : undefined,
          successRate: updates.taskSuccessRate ? updates.taskSuccessRate.toString() : undefined,
          updatedAt: new Date()
        })
        .where(eq(expertProfiles.id, profileId));
      
      console.log(`[ExpertProfile] Updated performance metrics for profile ${profileId}`);
      
    } catch (error: any) {
      console.error('[ExpertProfileService] Error updating performance:', error);
      throw error;
    }
  }
}
