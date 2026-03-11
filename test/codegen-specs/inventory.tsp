// TypeSpec definition for an Inventory Management API
// Tests TypeSpec parsing in the Code Generator

namespace InventoryService;

model Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  price: float64;
  currency: string;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

model Category {
  id: string;
  name: string;
  parentId?: string;
  description?: string;
}

model StockLevel {
  productId: string;
  warehouseId: string;
  quantity: int32;
  reservedQuantity: int32;
  reorderThreshold: int32;
  lastUpdated: string;
}

model Warehouse {
  id: string;
  name: string;
  location: string;
  capacity: int32;
  isActive: boolean;
}

model StockMovement {
  id: string;
  productId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  quantity: int32;
  reason: string;
  performedBy: string;
  timestamp: string;
}

@route("/products")
interface Products {
  @get list(): Product[];
  @get read(@path id: string): Product;
  @post create(@body product: Product): Product;
  @put update(@path id: string, @body product: Product): Product;
  @delete remove(@path id: string): void;
}

@route("/categories")
interface Categories {
  @get list(): Category[];
  @get read(@path id: string): Category;
  @post create(@body category: Category): Category;
}

@route("/stock")
interface Stock {
  @get levels(@query warehouseId?: string): StockLevel[];
  @post adjust(@body movement: StockMovement): StockMovement;
  @get movements(@query productId?: string): StockMovement[];
}

@route("/warehouses")
interface Warehouses {
  @get list(): Warehouse[];
  @get read(@path id: string): Warehouse;
  @post create(@body warehouse: Warehouse): Warehouse;
}
