CREATE VIRTUAL TABLE knowledge_search USING fts5(collection UNINDEXED, id UNINDEXED, title, body);
--> statement-breakpoint
CREATE TRIGGER projects_search_insert AFTER INSERT ON projects BEGIN
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('projects',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER projects_search_update AFTER UPDATE ON projects BEGIN
 DELETE FROM knowledge_search WHERE collection='projects' AND id=old.id;
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('projects',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER projects_search_delete AFTER DELETE ON projects BEGIN
 DELETE FROM knowledge_search WHERE collection='projects' AND id=old.id;
END;
--> statement-breakpoint
CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('tasks',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER tasks_search_update AFTER UPDATE ON tasks BEGIN
 DELETE FROM knowledge_search WHERE collection='tasks' AND id=old.id;
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('tasks',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN
 DELETE FROM knowledge_search WHERE collection='tasks' AND id=old.id;
END;
--> statement-breakpoint
CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('comments',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER comments_search_update AFTER UPDATE ON comments BEGIN
 DELETE FROM knowledge_search WHERE collection='comments' AND id=old.id;
 INSERT INTO knowledge_search(collection,id,title,body) VALUES('comments',new.id,new.title,new.body);
END;
--> statement-breakpoint
CREATE TRIGGER comments_search_delete AFTER DELETE ON comments BEGIN
 DELETE FROM knowledge_search WHERE collection='comments' AND id=old.id;
END;
--> statement-breakpoint
INSERT INTO knowledge_search(collection,id,title,body) SELECT 'projects',id,title,body FROM projects;
--> statement-breakpoint
INSERT INTO knowledge_search(collection,id,title,body) SELECT 'tasks',id,title,body FROM tasks;
--> statement-breakpoint
INSERT INTO knowledge_search(collection,id,title,body) SELECT 'comments',id,title,body FROM comments;
