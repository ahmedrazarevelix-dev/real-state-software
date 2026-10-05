-- AlterTable
ALTER TABLE "units" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "area" DECIMAL(10,2),
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "floor" INTEGER,
ADD COLUMN     "furnishing_status" TEXT DEFAULT 'unfurnished',
ADD COLUMN     "total_rooms" INTEGER,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
