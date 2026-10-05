-- AlterEnum: Add 'viewed' status to TourStatus
ALTER TYPE "TourStatus" ADD VALUE IF NOT EXISTS 'viewed';
