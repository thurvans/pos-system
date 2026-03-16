
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  passwordHash: 'passwordHash',
  role: 'role',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.RolePermissionScalarFieldEnum = {
  id: 'id',
  role: 'role',
  permission: 'permission',
  createdAt: 'createdAt'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  name: 'name',
  address: 'address',
  phone: 'phone',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  sku: 'sku',
  name: 'name',
  description: 'description',
  imageUrl: 'imageUrl',
  isActive: 'isActive',
  isAvailable: 'isAvailable',
  stockAlertThreshold: 'stockAlertThreshold',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  categoryId: 'categoryId'
};

exports.Prisma.PriceScalarFieldEnum = {
  id: 'id',
  price: 'price',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  productId: 'productId',
  branchId: 'branchId'
};

exports.Prisma.ProductVariantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  sku: 'sku',
  sortOrder: 'sortOrder',
  isDefault: 'isDefault',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  productId: 'productId'
};

exports.Prisma.VariantPriceScalarFieldEnum = {
  id: 'id',
  price: 'price',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  variantId: 'variantId',
  branchId: 'branchId'
};

exports.Prisma.ModifierGroupScalarFieldEnum = {
  id: 'id',
  name: 'name',
  inputType: 'inputType',
  minSelect: 'minSelect',
  maxSelect: 'maxSelect',
  isRequired: 'isRequired',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductModifierGroupScalarFieldEnum = {
  id: 'id',
  sortOrder: 'sortOrder',
  productId: 'productId',
  modifierGroupId: 'modifierGroupId'
};

exports.Prisma.ModifierOptionScalarFieldEnum = {
  id: 'id',
  name: 'name',
  priceDelta: 'priceDelta',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  modifierGroupId: 'modifierGroupId'
};

exports.Prisma.BundleScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  bundlePrice: 'bundlePrice',
  isActive: 'isActive',
  startAt: 'startAt',
  endAt: 'endAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BundleItemScalarFieldEnum = {
  id: 'id',
  quantity: 'quantity',
  bundleId: 'bundleId',
  productId: 'productId',
  variantId: 'variantId'
};

exports.Prisma.InventoryScalarFieldEnum = {
  id: 'id',
  quantity: 'quantity',
  minimumStock: 'minimumStock',
  updatedAt: 'updatedAt',
  productId: 'productId',
  branchId: 'branchId'
};

exports.Prisma.StockMovementScalarFieldEnum = {
  id: 'id',
  type: 'type',
  quantity: 'quantity',
  note: 'note',
  refId: 'refId',
  unitCost: 'unitCost',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  productId: 'productId',
  branchId: 'branchId'
};

exports.Prisma.UnitScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  createdAt: 'createdAt'
};

exports.Prisma.IngredientScalarFieldEnum = {
  id: 'id',
  sku: 'sku',
  name: 'name',
  minStock: 'minStock',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  unitId: 'unitId'
};

exports.Prisma.RecipeItemScalarFieldEnum = {
  id: 'id',
  quantity: 'quantity',
  lossFactor: 'lossFactor',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  productId: 'productId',
  ingredientId: 'ingredientId'
};

exports.Prisma.IngredientStockScalarFieldEnum = {
  id: 'id',
  quantity: 'quantity',
  updatedAt: 'updatedAt',
  ingredientId: 'ingredientId',
  branchId: 'branchId'
};

exports.Prisma.IngredientMovementScalarFieldEnum = {
  id: 'id',
  type: 'type',
  quantity: 'quantity',
  unitCost: 'unitCost',
  refId: 'refId',
  note: 'note',
  createdAt: 'createdAt',
  ingredientId: 'ingredientId',
  branchId: 'branchId',
  createdBy: 'createdBy'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  name: 'name',
  phone: 'phone',
  email: 'email',
  address: 'address',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  number: 'number',
  status: 'status',
  totalAmount: 'totalAmount',
  orderedAt: 'orderedAt',
  receivedAt: 'receivedAt',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId',
  supplierId: 'supplierId',
  createdBy: 'createdBy'
};

exports.Prisma.PurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  qtyOrdered: 'qtyOrdered',
  qtyReceived: 'qtyReceived',
  unitCost: 'unitCost',
  subtotal: 'subtotal',
  purchaseOrderId: 'purchaseOrderId',
  ingredientId: 'ingredientId'
};

exports.Prisma.StockOpnameScalarFieldEnum = {
  id: 'id',
  number: 'number',
  status: 'status',
  note: 'note',
  opnameAt: 'opnameAt',
  approvedAt: 'approvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId',
  performedBy: 'performedBy',
  approvedBy: 'approvedBy'
};

exports.Prisma.StockOpnameItemScalarFieldEnum = {
  id: 'id',
  systemQty: 'systemQty',
  actualQty: 'actualQty',
  differenceQty: 'differenceQty',
  note: 'note',
  stockOpnameId: 'stockOpnameId',
  ingredientId: 'ingredientId'
};

exports.Prisma.ShiftScalarFieldEnum = {
  id: 'id',
  openedAt: 'openedAt',
  closedAt: 'closedAt',
  openingCash: 'openingCash',
  closingCash: 'closingCash',
  status: 'status',
  userId: 'userId',
  branchId: 'branchId'
};

exports.Prisma.ShiftScheduleScalarFieldEnum = {
  id: 'id',
  startAt: 'startAt',
  endAt: 'endAt',
  status: 'status',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  userId: 'userId',
  branchId: 'branchId',
  createdBy: 'createdBy'
};

exports.Prisma.DiningTableScalarFieldEnum = {
  id: 'id',
  name: 'name',
  capacity: 'capacity',
  status: 'status',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.OrderScalarFieldEnum = {
  id: 'id',
  receiptNumber: 'receiptNumber',
  clientOrderId: 'clientOrderId',
  status: 'status',
  fulfillmentStatus: 'fulfillmentStatus',
  subtotal: 'subtotal',
  discountAmount: 'discountAmount',
  taxAmount: 'taxAmount',
  serviceCharge: 'serviceCharge',
  hppAmount: 'hppAmount',
  totalAmount: 'totalAmount',
  note: 'note',
  tableNumber: 'tableNumber',
  orderType: 'orderType',
  cancelReason: 'cancelReason',
  cancelledAt: 'cancelledAt',
  cancelledBy: 'cancelledBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  cashierId: 'cashierId',
  branchId: 'branchId',
  shiftId: 'shiftId',
  tableId: 'tableId'
};

exports.Prisma.OrderItemScalarFieldEnum = {
  id: 'id',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  discount: 'discount',
  subtotal: 'subtotal',
  hppSubtotal: 'hppSubtotal',
  modifierSnapshot: 'modifierSnapshot',
  note: 'note',
  orderId: 'orderId',
  productId: 'productId',
  variantId: 'variantId'
};

exports.Prisma.OrderStatusHistoryScalarFieldEnum = {
  id: 'id',
  fromStatus: 'fromStatus',
  toStatus: 'toStatus',
  note: 'note',
  changedAt: 'changedAt',
  orderId: 'orderId',
  changedBy: 'changedBy'
};

exports.Prisma.OrderCancellationLogScalarFieldEnum = {
  id: 'id',
  reason: 'reason',
  note: 'note',
  previousStatus: 'previousStatus',
  cancelledAt: 'cancelledAt',
  orderId: 'orderId',
  cancelledBy: 'cancelledBy'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  method: 'method',
  status: 'status',
  amount: 'amount',
  idempotencyKey: 'idempotencyKey',
  gatewayRef: 'gatewayRef',
  qrPayload: 'qrPayload',
  expiredAt: 'expiredAt',
  paidAt: 'paidAt',
  meta: 'meta',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  orderId: 'orderId'
};

exports.Prisma.PaymentEventScalarFieldEnum = {
  id: 'id',
  eventType: 'eventType',
  provider: 'provider',
  rawPayload: 'rawPayload',
  processedAt: 'processedAt',
  paymentId: 'paymentId'
};

exports.Prisma.PaymentAttemptScalarFieldEnum = {
  id: 'id',
  status: 'status',
  note: 'note',
  createdAt: 'createdAt',
  paymentId: 'paymentId'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  action: 'action',
  entity: 'entity',
  entityId: 'entityId',
  oldData: 'oldData',
  newData: 'newData',
  ip: 'ip',
  createdAt: 'createdAt',
  userId: 'userId'
};

exports.Prisma.CashMovementScalarFieldEnum = {
  id: 'id',
  type: 'type',
  amount: 'amount',
  note: 'note',
  createdAt: 'createdAt',
  shiftId: 'shiftId',
  recordedBy: 'recordedBy'
};

exports.Prisma.RefundScalarFieldEnum = {
  id: 'id',
  paymentId: 'paymentId',
  orderId: 'orderId',
  amount: 'amount',
  reason: 'reason',
  status: 'status',
  gatewayRef: 'gatewayRef',
  requestedBy: 'requestedBy',
  processedAt: 'processedAt',
  failReason: 'failReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PromotionScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  type: 'type',
  valueType: 'valueType',
  value: 'value',
  buyQty: 'buyQty',
  getQty: 'getQty',
  startAt: 'startAt',
  endAt: 'endAt',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.PromotionTargetScalarFieldEnum = {
  id: 'id',
  targetType: 'targetType',
  targetId: 'targetId',
  minQty: 'minQty',
  branchId: 'branchId',
  promotionId: 'promotionId',
  productId: 'productId',
  categoryId: 'categoryId',
  bundleId: 'bundleId'
};

exports.Prisma.BusinessProfileScalarFieldEnum = {
  id: 'id',
  name: 'name',
  logoUrl: 'logoUrl',
  address: 'address',
  phone: 'phone',
  email: 'email',
  taxNumber: 'taxNumber',
  taxRate: 'taxRate',
  serviceChargeRate: 'serviceChargeRate',
  currency: 'currency',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.PaymentMethodSettingScalarFieldEnum = {
  id: 'id',
  method: 'method',
  isActive: 'isActive',
  configuration: 'configuration',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.PrinterSettingScalarFieldEnum = {
  id: 'id',
  name: 'name',
  printerType: 'printerType',
  connectionInfo: 'connectionInfo',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.InvoiceSettingScalarFieldEnum = {
  id: 'id',
  headerText: 'headerText',
  footerText: 'footerText',
  showLogo: 'showLogo',
  showTaxBreakdown: 'showTaxBreakdown',
  prefix: 'prefix',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  branchId: 'branchId'
};

exports.Prisma.BackupLogScalarFieldEnum = {
  id: 'id',
  status: 'status',
  filePath: 'filePath',
  sizeBytes: 'sizeBytes',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  triggeredBy: 'triggeredBy'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.Role = exports.$Enums.Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  KITCHEN: 'KITCHEN'
};

exports.FeaturePermission = exports.$Enums.FeaturePermission = {
  DASHBOARD_OVERVIEW: 'DASHBOARD_OVERVIEW',
  DASHBOARD_REVENUE_TREND: 'DASHBOARD_REVENUE_TREND',
  DASHBOARD_TOP_PRODUCTS: 'DASHBOARD_TOP_PRODUCTS',
  DASHBOARD_OCCUPANCY: 'DASHBOARD_OCCUPANCY',
  DASHBOARD_ACTIVE_ORDERS: 'DASHBOARD_ACTIVE_ORDERS',
  MENU_CATEGORY_MANAGE: 'MENU_CATEGORY_MANAGE',
  MENU_ITEM_MANAGE: 'MENU_ITEM_MANAGE',
  MENU_VARIANT_MANAGE: 'MENU_VARIANT_MANAGE',
  MENU_MODIFIER_MANAGE: 'MENU_MODIFIER_MANAGE',
  MENU_BUNDLE_MANAGE: 'MENU_BUNDLE_MANAGE',
  ORDER_MONITOR: 'ORDER_MONITOR',
  ORDER_HISTORY_VIEW: 'ORDER_HISTORY_VIEW',
  ORDER_CANCEL: 'ORDER_CANCEL',
  INVENTORY_MASTER_MANAGE: 'INVENTORY_MASTER_MANAGE',
  INVENTORY_PURCHASE_MANAGE: 'INVENTORY_PURCHASE_MANAGE',
  INVENTORY_STOCK_OPNAME: 'INVENTORY_STOCK_OPNAME',
  INVENTORY_REPORT_VIEW: 'INVENTORY_REPORT_VIEW',
  FINANCE_REPORT_VIEW: 'FINANCE_REPORT_VIEW',
  FINANCE_EXPORT_PDF: 'FINANCE_EXPORT_PDF',
  SHIFT_RECAP_VIEW: 'SHIFT_RECAP_VIEW',
  EMPLOYEE_MANAGE: 'EMPLOYEE_MANAGE',
  EMPLOYEE_SHIFT_MANAGE: 'EMPLOYEE_SHIFT_MANAGE',
  AUDIT_LOG_VIEW: 'AUDIT_LOG_VIEW',
  PROMO_MANAGE: 'PROMO_MANAGE',
  SYSTEM_SETTINGS_MANAGE: 'SYSTEM_SETTINGS_MANAGE',
  SYSTEM_BACKUP_MANAGE: 'SYSTEM_BACKUP_MANAGE'
};

exports.ModifierInputType = exports.$Enums.ModifierInputType = {
  SINGLE: 'SINGLE',
  MULTIPLE: 'MULTIPLE'
};

exports.MovementType = exports.$Enums.MovementType = {
  SALE: 'SALE',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  PURCHASE: 'PURCHASE',
  VOID: 'VOID',
  RECIPE_USAGE: 'RECIPE_USAGE',
  STOCK_OPNAME: 'STOCK_OPNAME'
};

exports.IngredientMovementType = exports.$Enums.IngredientMovementType = {
  PURCHASE: 'PURCHASE',
  USAGE: 'USAGE',
  ADJUSTMENT: 'ADJUSTMENT',
  OPNAME: 'OPNAME',
  WASTE: 'WASTE',
  RETURN: 'RETURN'
};

exports.PurchaseOrderStatus = exports.$Enums.PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED'
};

exports.StockOpnameStatus = exports.$Enums.StockOpnameStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED'
};

exports.ShiftStatus = exports.$Enums.ShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
};

exports.ScheduleStatus = exports.$Enums.ScheduleStatus = {
  PLANNED: 'PLANNED',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED'
};

exports.TableStatus = exports.$Enums.TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE'
};

exports.OrderStatus = exports.$Enums.OrderStatus = {
  DRAFT: 'DRAFT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID'
};

exports.OrderFulfillmentStatus = exports.$Enums.OrderFulfillmentStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED'
};

exports.OrderType = exports.$Enums.OrderType = {
  DINE_IN: 'DINE_IN',
  TAKE_AWAY: 'TAKE_AWAY',
  DELIVERY: 'DELIVERY'
};

exports.PaymentMethod = exports.$Enums.PaymentMethod = {
  CASH: 'CASH',
  QRIS: 'QRIS',
  VIRTUAL_ACCOUNT: 'VIRTUAL_ACCOUNT',
  EWALLET: 'EWALLET',
  CARD: 'CARD'
};

exports.PaymentStatus = exports.$Enums.PaymentStatus = {
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED'
};

exports.CashMovementType = exports.$Enums.CashMovementType = {
  OPENING: 'OPENING',
  CLOSING: 'CLOSING',
  CASH_IN: 'CASH_IN',
  CASH_OUT: 'CASH_OUT'
};

exports.RefundStatus = exports.$Enums.RefundStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
};

exports.PromotionType = exports.$Enums.PromotionType = {
  PERCENTAGE: 'PERCENTAGE',
  NOMINAL: 'NOMINAL',
  HAPPY_HOUR: 'HAPPY_HOUR',
  BUNDLE: 'BUNDLE',
  BUY_ONE_GET_ONE: 'BUY_ONE_GET_ONE'
};

exports.PromotionValueType = exports.$Enums.PromotionValueType = {
  PERCENTAGE: 'PERCENTAGE',
  NOMINAL: 'NOMINAL'
};

exports.PromotionTargetType = exports.$Enums.PromotionTargetType = {
  ORDER: 'ORDER',
  PRODUCT: 'PRODUCT',
  CATEGORY: 'CATEGORY',
  BUNDLE: 'BUNDLE'
};

exports.Prisma.ModelName = {
  User: 'User',
  RolePermission: 'RolePermission',
  Branch: 'Branch',
  Category: 'Category',
  Product: 'Product',
  Price: 'Price',
  ProductVariant: 'ProductVariant',
  VariantPrice: 'VariantPrice',
  ModifierGroup: 'ModifierGroup',
  ProductModifierGroup: 'ProductModifierGroup',
  ModifierOption: 'ModifierOption',
  Bundle: 'Bundle',
  BundleItem: 'BundleItem',
  Inventory: 'Inventory',
  StockMovement: 'StockMovement',
  Unit: 'Unit',
  Ingredient: 'Ingredient',
  RecipeItem: 'RecipeItem',
  IngredientStock: 'IngredientStock',
  IngredientMovement: 'IngredientMovement',
  Supplier: 'Supplier',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderItem: 'PurchaseOrderItem',
  StockOpname: 'StockOpname',
  StockOpnameItem: 'StockOpnameItem',
  Shift: 'Shift',
  ShiftSchedule: 'ShiftSchedule',
  DiningTable: 'DiningTable',
  Order: 'Order',
  OrderItem: 'OrderItem',
  OrderStatusHistory: 'OrderStatusHistory',
  OrderCancellationLog: 'OrderCancellationLog',
  Payment: 'Payment',
  PaymentEvent: 'PaymentEvent',
  PaymentAttempt: 'PaymentAttempt',
  AuditLog: 'AuditLog',
  CashMovement: 'CashMovement',
  Refund: 'Refund',
  Promotion: 'Promotion',
  PromotionTarget: 'PromotionTarget',
  BusinessProfile: 'BusinessProfile',
  PaymentMethodSetting: 'PaymentMethodSetting',
  PrinterSetting: 'PrinterSetting',
  InvoiceSetting: 'InvoiceSetting',
  BackupLog: 'BackupLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
