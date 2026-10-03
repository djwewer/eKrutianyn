-- CreateTable
CREATE TABLE "ReferenceSource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "probyPointId" TEXT,
    "extractedText" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferenceSource_probyPointId_idx" ON "ReferenceSource"("probyPointId");

-- AddForeignKey
ALTER TABLE "ReferenceSource" ADD CONSTRAINT "ReferenceSource_probyPointId_fkey" FOREIGN KEY ("probyPointId") REFERENCES "ProbyPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
