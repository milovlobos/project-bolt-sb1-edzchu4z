# ============================================================
#  Taekwondo Evaluation System – Makefile
#  Uso:  make up   (levanta todo con docker compose)
# ============================================================

# --- Variables configurables ---
# Si tu usuario no está en el grupo docker, usa:  make up DOCKER_SUDO=sudo
DOCKER_SUDO   ?=
COMPOSE       = $(DOCKER_SUDO) docker compose
DOCKER        = $(DOCKER_SUDO) docker
PROJECT_NAME  = tkd-system
ENV_FILE      = .env

# --- Colores para output ---
GREEN  = \033[0;32m
YELLOW = \033[0;33m
RED    = \033[0;31m
NC     = \033[0m  # No Color

# ============================================================
#  Comandos principales
# ============================================================

.PHONY: help
help: ## Muestra esta ayuda
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║   Taekwondo Evaluation System – Comandos Make   ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-18s$(NC) %s\n", $$1, $$2}'
	@echo ""

.PHONY: up
up: env-check ## 🚀 Construye y levanta todos los servicios (producción)
	@echo "$(GREEN)>>> Construyendo y levantando servicios...$(NC)"
	$(COMPOSE) -p $(PROJECT_NAME) --env-file $(ENV_FILE) up -d --build
	@echo ""
	@echo "$(GREEN)✔ Sistema levantado correctamente$(NC)"
	@echo "  Frontend: http://localhost:$$(grep -oP 'FRONTEND_PORT=\K.*' $(ENV_FILE) 2>/dev/null || echo 4000)"
	@echo "  Backend:  http://localhost:$$(grep -oP 'BACKEND_PORT=\K.*' $(ENV_FILE) 2>/dev/null || echo 8001) (interno)"
	@echo ""

.PHONY: down
down: ## 🛑 Detiene y elimina los contenedores
	@echo "$(RED)>>> Deteniendo servicios...$(NC)"
	$(COMPOSE) -p $(PROJECT_NAME) down
	@echo "$(GREEN)✔ Servicios detenidos$(NC)"

.PHONY: restart
restart: ## 🔄 Reinicia todos los servicios
	@echo "$(YELLOW)>>> Reiniciando servicios...$(NC)"
	$(COMPOSE) -p $(PROJECT_NAME) restart
	@echo "$(GREEN)✔ Servicios reiniciados$(NC)"

.PHONY: build
build: ## 🔨 Construye las imágenes sin levantar
	@echo "$(GREEN)>>> Construyendo imágenes...$(NC)"
	$(COMPOSE) -p $(PROJECT_NAME) --env-file $(ENV_FILE) build --no-cache
	@echo "$(GREEN)✔ Imágenes construidas$(NC)"

# ============================================================
#  Monitoreo y depuración
# ============================================================

.PHONY: logs
logs: ## 📋 Muestra los logs de todos los servicios (en vivo)
	$(COMPOSE) -p $(PROJECT_NAME) logs -f

.PHONY: logs-backend
logs-backend: ## 📋 Muestra logs del backend
	$(COMPOSE) -p $(PROJECT_NAME) logs -f backend

.PHONY: logs-frontend
logs-frontend: ## 📋 Muestra logs del frontend
	$(COMPOSE) -p $(PROJECT_NAME) logs -f frontend

.PHONY: ps
ps: ## 📊 Muestra el estado de los contenedores
	$(COMPOSE) -p $(PROJECT_NAME) ps

.PHONY: stats
stats: ## 📈 Muestra estadísticas de uso de recursos
	$(DOCKER) stats --no-stream $$($(COMPOSE) -p $(PROJECT_NAME) ps -q)

# ============================================================
#  Base de datos
# ============================================================

.PHONY: backup
backup: ## 💾 Crea un backup de la base de datos SQLite
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S) && \
	$(DOCKER) cp tkd-backend:/data/taekwondo.db backups/taekwondo_$$TIMESTAMP.db && \
	echo "$(GREEN)✔ Backup creado: backups/taekwondo_$$TIMESTAMP.db$(NC)"

.PHONY: restore
restore: ## 💾 Restaura la BD desde el backup más reciente (o BACKUP_FILE=ruta)
	@if [ -n "$(BACKUP_FILE)" ]; then \
		$(DOCKER) cp $(BACKUP_FILE) tkd-backend:/data/taekwondo.db && \
		echo "$(GREEN)✔ BD restaurada desde $(BACKUP_FILE)$(NC)"; \
		$(MAKE) restart; \
	else \
		LATEST=$$(ls -t backups/taekwondo_*.db 2>/dev/null | head -1) && \
		if [ -z "$$LATEST" ]; then \
			echo "$(RED)✖ No hay backups disponibles$(NC)"; \
			exit 1; \
		fi && \
		$(DOCKER) cp $$LATEST tkd-backend:/data/taekwondo.db && \
		echo "$(GREEN)✔ BD restaurada desde $$LATEST$(NC)"; \
		$(MAKE) restart; \
	fi

.PHONY: seed
seed: ## 🌱 Copia la BD local al volumen del contenedor
	@if [ -f taekwondo.db ]; then \
		$(DOCKER) cp taekwondo.db tkd-backend:/data/taekwondo.db && \
		echo "$(GREEN)✔ BD local copiada al contenedor$(NC)"; \
		$(MAKE) restart; \
	else \
		echo "$(YELLOW)⚠ No se encontró taekwondo.db en la raíz del proyecto$(NC)"; \
	fi

# ============================================================
#  Limpieza
# ============================================================

.PHONY: clean
clean: down ## 🧹 Detiene servicios y elimina imágenes del proyecto
	@echo "$(YELLOW)>>> Eliminando imágenes del proyecto...$(NC)"
	$(DOCKER) rmi -f $$($(DOCKER) images --filter "reference=*tkd*" -q) 2>/dev/null || true
	@echo "$(GREEN)✔ Limpieza completada$(NC)"

.PHONY: clean-all
clean-all: down ## 🧹 Limpieza total (contenedores, imágenes, volúmenes, caché)
	@echo "$(RED)>>> Limpieza total...$(NC)"
	$(DOCKER) rmi -f $$($(DOCKER) images --filter "reference=*tkd*" -q) 2>/dev/null || true
	$(COMPOSE) -p $(PROJECT_NAME) down -v --rmi all 2>/dev/null || true
	$(DOCKER) builder prune -f
	@echo "$(GREEN)✔ Limpieza total completada$(NC)"

.PHONY: prune
prune: ## 🧹 Limpia recursos Docker no utilizados (global)
	@echo "$(YELLOW)>>> Eliminando recursos Docker no utilizados...$(NC)"
	$(DOCKER) system prune -f
	@echo "$(GREEN)✔ Prune completado$(NC)"

# ============================================================
#  Utilidades
# ============================================================

.PHONY: shell-backend
shell-backend: ## 🐚 Abre una shell en el contenedor backend
	$(DOCKER) exec -it tkd-backend /bin/bash

.PHONY: shell-frontend
shell-frontend: ## 🐚 Abre una shell en el contenedor frontend
	$(DOCKER) exec -it tkd-frontend /bin/sh

.PHONY: env-check
env-check: ## ✅ Verifica que el archivo .env exista
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "$(YELLOW)⚠ Archivo .env no encontrado. Creando desde .env.example...$(NC)"; \
		cp .env.example $(ENV_FILE); \
		echo "$(GREEN)✔ Archivo .env creado. Revisa y ajusta los valores antes de continuar.$(NC)"; \
	fi

.PHONY: info
info: ## ℹ️  Muestra información del sistema
	@echo ""
	@echo "$(GREEN)╔══════════════════════════════════════════════════╗$(NC)"
	@echo "$(GREEN)║          Información del Sistema                 ║$(NC)"
	@echo "$(GREEN)╚══════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "  Docker version:   $$($(DOCKER) --version)"
	@echo "  Compose version:  $$($(COMPOSE) version)"
	@echo ""
	@echo "  Contenedores activos:"
	@$(COMPOSE) -p $(PROJECT_NAME) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (ninguno)"
	@echo ""
	@echo "  Volúmenes:"
	@$(DOCKER) volume ls --filter "name=$(PROJECT_NAME)" --format "  {{.Name}}" 2>/dev/null || echo "  (ninguno)"
	@echo ""

# ============================================================
#  Valores por defecto
# ============================================================

.DEFAULT_GOAL := help
