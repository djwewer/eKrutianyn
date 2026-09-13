-- CreateTable
CREATE TABLE "JunakStageProgress" (
    "id" TEXT NOT NULL,
    "junakId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "firstClosedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,

    CONSTRAINT "JunakStageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JunakStageProgress_junakId_stageId_key" ON "JunakStageProgress"("junakId", "stageId");

-- AddForeignKey
ALTER TABLE "JunakStageProgress" ADD CONSTRAINT "JunakStageProgress_junakId_fkey" FOREIGN KEY ("junakId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakStageProgress" ADD CONSTRAINT "JunakStageProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProbyStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JunakStageProgress" ADD CONSTRAINT "JunakStageProgress_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
