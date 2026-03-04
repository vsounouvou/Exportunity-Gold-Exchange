import { db } from "@db";
import { eq, desc, and, sql, ilike, gte, lte, or, asc } from "drizzle-orm";
import {
  sellers, sellerProducts, productCategories, marketplaceOrders, marketplaceOrderItems,
  sellerWalletTransactions, buyerWallets, buyerWalletTransactions,
  territories, franchisees, franchiseCommissions, sellerReviews,
  geoContinents, geoCountries, geoRegions, geoCities, geoDistricts, geoNeighborhoods
} from "@db/schema";
import { nanoid } from "nanoid";
import { generateAndStoreImage } from "./imageGen/service";

export class MarketplaceService {
  async getGeolocation() {
    const continents = await db.select().from(geoContinents);
    const countries = await db.select().from(geoCountries);
    const regions = await db.select().from(geoRegions);
    const cities = await db.select().from(geoCities);
    const districts = await db.select().from(geoDistricts);
    const neighborhoods = await db.select().from(geoNeighborhoods);
    
    return { continents, countries, regions, cities, districts, neighborhoods };
  }

  async getCountries(continentId?: number) {
    if (continentId) {
      return db.select().from(geoCountries).where(eq(geoCountries.continentId, continentId));
    }
    return db.select().from(geoCountries).orderBy(asc(geoCountries.name));
  }

  async getRegions(countryId: number) {
    return db.select().from(geoRegions).where(eq(geoRegions.countryId, countryId));
  }

  async getCities(regionId: number) {
    return db.select().from(geoCities).where(eq(geoCities.regionId, regionId));
  }

  async getDistricts(cityId: number) {
    return db.select().from(geoDistricts).where(eq(geoDistricts.cityId, cityId));
  }

  async getNeighborhoods(districtId: number) {
    return db.select().from(geoNeighborhoods).where(eq(geoNeighborhoods.districtId, districtId));
  }

  async getCategories() {
    return db.select().from(productCategories).orderBy(asc(productCategories.sortOrder));
  }

  async createSeller(data: {
    tenantId: number;
    userId: number;
    shopName: string;
    description?: string;
    phoneNumber?: string;
    email?: string;
    countryId?: number;
    regionId?: number;
    cityId?: number;
    districtId?: number;
    neighborhoodId?: number;
    streetAddress?: string;
    latitude?: number;
    longitude?: number;
    productionType?: string;
    businessRegistration?: string;
    personalId?: string;
  }) {
    const slug = data.shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(6);
    
    const [seller] = await db.insert(sellers).values({
      tenantId: data.tenantId,
      userId: data.userId,
      shopName: data.shopName,
      slug,
      description: data.description,
      phoneNumber: data.phoneNumber,
      email: data.email,
      countryId: data.countryId,
      regionId: data.regionId,
      cityId: data.cityId,
      districtId: data.districtId,
      neighborhoodId: data.neighborhoodId,
      streetAddress: data.streetAddress,
      latitude: data.latitude?.toString(),
      longitude: data.longitude?.toString(),
      productionType: data.productionType,
      businessRegistration: data.businessRegistration,
      personalId: data.personalId,
      status: 'pending',
      isProducer: true,
    }).returning();
    
    return seller;
  }

  async getSeller(id: number) {
    const [seller] = await db.select().from(sellers).where(eq(sellers.id, id));
    return seller;
  }

  async getSellerByUserId(userId: number) {
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, userId));
    return seller;
  }

  async getAllSellers(filters?: { status?: string; countryId?: number; search?: string }) {
    let query = db.select().from(sellers);
    
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(sellers.status, filters.status as any));
    }
    if (filters?.countryId) {
      conditions.push(eq(sellers.countryId, filters.countryId));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(sellers.shopName, `%${filters.search}%`),
          ilike(sellers.description || '', `%${filters.search}%`)
        )
      );
    }
    
    if (conditions.length > 0) {
      return db.select().from(sellers).where(and(...conditions)).orderBy(desc(sellers.createdAt));
    }
    
    return db.select().from(sellers).orderBy(desc(sellers.createdAt));
  }

  async updateSeller(id: number, data: Partial<typeof sellers.$inferInsert>) {
    const [updated] = await db.update(sellers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sellers.id, id))
      .returning();
    return updated;
  }

  async approveSeller(id: number, approvedBy: number) {
    return this.updateSeller(id, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy,
    });
  }

  async rejectSeller(id: number, reason: string) {
    return this.updateSeller(id, {
      status: 'rejected',
      rejectionReason: reason,
    });
  }

  async createProduct(tenantId: number, sellerId: number, data: {
    name: string;
    description?: string;
    shortDescription?: string;
    price: number;
    compareAtPrice?: number;
    categoryId?: number;
    sku?: string;
    stockQuantity?: number;
    images?: any[];
    isHandmade?: boolean;
    productionTime?: string;
    ingredients?: any[];
    tags?: string[];
  }) {
    const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(6);
    
    const [product] = await db.insert(sellerProducts).values({
      tenantId,
      sellerId,
      name: data.name,
      slug,
      description: data.description,
      shortDescription: data.shortDescription,
      price: data.price.toString(),
      compareAtPrice: data.compareAtPrice?.toString(),
      categoryId: data.categoryId,
      sku: data.sku,
      stockQuantity: data.stockQuantity || 0,
      images: data.images,
      isHandmade: data.isHandmade ?? true,
      productionTime: data.productionTime,
      ingredients: data.ingredients,
      tags: data.tags,
      status: 'draft',
    }).returning();

    // Auto-generate a primary image if none provided
    if (!data.images || (Array.isArray(data.images) && data.images.length === 0)) {
      const categoryKey = data.categoryId ? `cat-${data.categoryId}` : "general";
      const assetKey = `products/${categoryKey}/${product.id}/primary`;
      const prompt = `institutional product studio photo of ${data.name}, clean background, realistic lighting, neutral colors`;
      // Fire-and-forget so product creation is not blocked
      setImmediate(async () => {
        try {
          await generateAndStoreImage({
            namespace: "products",
            assetKey,
            prompt,
            mode: "fast",
            input: { aspect_ratio: "1:1", output_format: "png" },
            setActive: true,
          });
        } catch (err) {
          console.error("Auto product image generation failed", err);
        }
      });
    }

    return product;
  }

  async getProduct(id: number) {
    const [product] = await db.select().from(sellerProducts).where(eq(sellerProducts.id, id));
    return product;
  }

  async getSellerProducts(sellerId: number) {
    return db.select().from(sellerProducts).where(eq(sellerProducts.sellerId, sellerId)).orderBy(desc(sellerProducts.createdAt));
  }

  async updateProduct(id: number, data: Partial<typeof sellerProducts.$inferInsert>) {
    const [updated] = await db.update(sellerProducts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sellerProducts.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: number) {
    await db.delete(sellerProducts).where(eq(sellerProducts.id, id));
  }

  async searchProducts(params: {
    query?: string;
    categoryId?: number;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }) {
    const conditions = [eq(sellerProducts.status, 'active')];
    
    if (params.query) {
      conditions.push(
        or(
          ilike(sellerProducts.name, `%${params.query}%`),
          ilike(sellerProducts.description || '', `%${params.query}%`)
        )!
      );
    }
    
    if (params.categoryId) {
      conditions.push(eq(sellerProducts.categoryId, params.categoryId));
    }
    
    if (params.minPrice) {
      conditions.push(gte(sellerProducts.price, params.minPrice.toString()));
    }
    
    if (params.maxPrice) {
      conditions.push(lte(sellerProducts.price, params.maxPrice.toString()));
    }
    
    const productList = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories,
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
      .where(and(...conditions))
      .limit(params.limit || 50)
      .offset(params.offset || 0)
      .orderBy(desc(sellerProducts.createdAt));
    
    return productList;
  }

  async getSellerOrders(sellerId: number, status?: string) {
    const conditions = [eq(marketplaceOrders.sellerId, sellerId)];
    if (status) {
      conditions.push(eq(marketplaceOrders.status, status as any));
    }
    
    return db.select().from(marketplaceOrders)
      .where(and(...conditions))
      .orderBy(desc(marketplaceOrders.createdAt));
  }

  async getOrderDetails(orderId: number) {
    const [order] = await db.select().from(marketplaceOrders).where(eq(marketplaceOrders.id, orderId));
    const items = await db.select().from(marketplaceOrderItems).where(eq(marketplaceOrderItems.orderId, orderId));
    return { order, items };
  }

  async updateOrderStatus(orderId: number, status: string) {
    const statusFields: any = { status, updatedAt: new Date() };
    
    switch (status) {
      case 'confirmed':
        statusFields.confirmedAt = new Date();
        break;
      case 'ready_for_pickup':
        statusFields.readyAt = new Date();
        break;
      case 'delivered':
        statusFields.deliveredAt = new Date();
        break;
      case 'cancelled':
        statusFields.cancelledAt = new Date();
        break;
    }
    
    const [updated] = await db.update(marketplaceOrders)
      .set(statusFields)
      .where(eq(marketplaceOrders.id, orderId))
      .returning();
    
    return updated;
  }

  async getSellerWalletTransactions(sellerId: number, limit = 50) {
    return db.select().from(sellerWalletTransactions)
      .where(eq(sellerWalletTransactions.sellerId, sellerId))
      .orderBy(desc(sellerWalletTransactions.createdAt))
      .limit(limit);
  }

  async getSellerStats(sellerId: number) {
    const seller = await this.getSeller(sellerId);
    const orders = await db.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.sellerId, sellerId));
    
    const completedOrders = orders.filter(o => o.status === 'delivered');
    const pendingOrders = orders.filter(o => ['pending', 'confirmed', 'processing'].includes(o.status ?? ""));
    
    const prods = await this.getSellerProducts(sellerId);
    const activeProducts = prods.filter(p => p.status === 'active');
    const lowStockProducts = prods.filter(p => (p.stockQuantity || 0) <= (p.lowStockThreshold || 5));
    
    return {
      seller,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      totalProducts: prods.length,
      activeProducts: activeProducts.length,
      lowStockProducts: lowStockProducts.length,
      walletBalance: seller?.walletBalance || '0.00',
      totalSales: seller?.totalSales || '0.00',
      rating: seller?.rating || '5.00',
      reviewCount: seller?.reviewCount || 0,
    };
  }

  async createDemoSeller(tenantId: number, userId: number) {
    const seller = await this.createSeller({
      tenantId,
      userId,
      shopName: "Demo Gold Seller",
      description: "Demo gold seller for testing: stamped pieces, dore lots, and heritage items.",
      phoneNumber: '+225 00 00 00 00',
      email: "demo@boursedelor.com",
      productionType: "gold_retail",
    });
    
    await this.updateSeller(seller.id, {
      isDemo: true,
      status: 'approved',
      approvedAt: new Date(),
    });
    
    const categories = await this.getCategories();
    const stampedCategory = categories.find(c => c.slug === 'stamped');
    const jewelryCategory = categories.find(c => c.slug === 'jewelry');
    const doreCategory = categories.find(c => c.slug === 'dore');
    
    await this.createProduct(tenantId, seller.id, {
      name: "Stamped Gold Piece - 20g (22K)",
      description: "Stamped 22K gold piece (20g) with certification. Retail-ready for secure delivery or custody.",
      price: 60000,
      categoryId: stampedCategory?.id,
      stockQuantity: 35,
      isHandmade: false,
      productionTime: "Same day",
      tags: ["gold", "stamped", "22k"],
    });
    
    await this.createProduct(tenantId, seller.id, {
      name: "Gold Art Object - Heritage Series",
      description: "Curated gold art / heritage object with certificate. Secure delivery available.",
      price: 2600000,
      categoryId: jewelryCategory?.id,
      stockQuantity: 3,
      isHandmade: true,
      productionTime: "2-5 days",
      tags: ["gold", "heritage", "art"],
    });
    
    await this.createProduct(tenantId, seller.id, {
      name: "Gold Doré Lot - Standard Grade",
      description: "Doré lot available in grams. Compliance and verification required. Sold by Bourse de l'Or.",
      price: 74000,
      categoryId: doreCategory?.id,
      stockQuantity: 10,
      isHandmade: false,
      tags: ["gold", "dore", "wholesale"],
    });
    
    return seller;
  }

  async getDashboardStats() {
    const allSellers = await db.select().from(sellers);
    const allProducts = await db.select().from(sellerProducts);
    const allOrders = await db.select().from(marketplaceOrders);
    
    const approvedSellers = allSellers.filter(s => s.status === 'approved');
    const pendingSellers = allSellers.filter(s => s.status === 'pending');
    const activeProducts = allProducts.filter(p => p.status === 'active');
    const completedOrders = allOrders.filter(o => o.status === 'delivered');
    
    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    
    return {
      sellers: {
        total: allSellers.length,
        approved: approvedSellers.length,
        pending: pendingSellers.length,
      },
      products: {
        total: allProducts.length,
        active: activeProducts.length,
      },
      orders: {
        total: allOrders.length,
        completed: completedOrders.length,
      },
      revenue: {
        total: totalRevenue,
      },
    };
  }
}

export const marketplaceService = new MarketplaceService();
