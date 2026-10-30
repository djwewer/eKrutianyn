-- CreateIndex
CREATE INDEX "Hurtok_kurinId_idx" ON "Hurtok"("kurinId");

-- CreateIndex
CREATE INDEX "User_kurinId_role_idx" ON "User"("kurinId", "role");

-- CreateIndex
CREATE INDEX "User_hurtokId_idx" ON "User"("hurtokId");

-- CreateIndex
CREATE INDEX "KurinPosition_userId_removedAt_idx" ON "KurinPosition"("userId", "removedAt");

-- CreateIndex
CREATE INDEX "KurinPosition_kurinId_scope_removedAt_idx" ON "KurinPosition"("kurinId", "scope", "removedAt");

-- CreateIndex
CREATE INDEX "KurinPosition_hurtokId_idx" ON "KurinPosition"("hurtokId");

-- CreateIndex
CREATE INDEX "InventoryItem_kurinId_idx" ON "InventoryItem"("kurinId");

-- CreateIndex
CREATE INDEX "GuardianContact_junakId_idx" ON "GuardianContact"("junakId");

-- CreateIndex
CREATE INDEX "VykhovnykHurtok_hurtokId_idx" ON "VykhovnykHurtok"("hurtokId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_initiatedById_idx" ON "ApprovalRequest"("initiatedById");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_userId_idx" ON "EmailChangeRequest"("userId");

-- CreateIndex
CREATE INDEX "ProfileChangeLog_userId_idx" ON "ProfileChangeLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
