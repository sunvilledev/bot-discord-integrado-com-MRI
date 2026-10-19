ALTER TABLE `users`
ADD COLUMN IF NOT EXISTS `passlist` TINYINT(1) NOT NULL DEFAULT 0;

-- Copia da coluna antiga só se players.passlist ainda existir.
SET @has_players_passlist := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'players'
      AND COLUMN_NAME = 'passlist'
);

SET @copy_passlist := IF(
    @has_players_passlist > 0,
    'UPDATE users u INNER JOIN players p ON p.userId = u.userId SET u.passlist = 1 WHERE p.passlist = 1 AND u.passlist = 0',
    'SELECT 1'
);

PREPARE copy_passlist_stmt FROM @copy_passlist;
EXECUTE copy_passlist_stmt;
DEALLOCATE PREPARE copy_passlist_stmt;
