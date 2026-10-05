-- AlterTable
ALTER TABLE "conversation_messages" ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "read_at" TIMESTAMP(3);
