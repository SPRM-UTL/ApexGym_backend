# ApexGym Backend

Guía de configuración, base de datos y flujo de migraciones con Prisma.

---

## 🚀 1. Configuración Inicial (Descarga / Clonación del Proyecto)

Cuando descargas o clonas el proyecto por primera vez:

### 1.1 Instalar dependencias
```bash
npm install
```

### 1.2 Configurar variables de entorno
Crea o verifica tu archivo `.env` en la raíz de `ApexGym_backend/` con las credenciales de tu base de datos MySQL / MariaDB:

```env
PORT=3000

# Base de datos MySQL / MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=apexgym

# URL requerida por Prisma
DATABASE_URL="mysql://root:@localhost:3306/apexgym"
```

> **Nota sobre MySQL / MariaDB**: Asegúrate de que las tablas utilicen el motor **`InnoDB`** (estándar para transacciones y soporte de llaves foráneas / *Foreign Keys*).

---

## 🗄️ 2. Aplicar Migraciones Existentes

> ⚠️ **NO utilices** `npx prisma migrate dev --name init` cuando ya existan migraciones en la carpeta `prisma/migrations`.

### Al descargar cambios o hacer `git pull`:
Para aplicar todas las migraciones pendientes que ya vienen en el repositorio a tu base de datos local:

```bash
npx prisma migrate dev
```
*(Si no hay cambios pendientes en `schema.prisma`, Prisma únicamente aplicará las migraciones pendientes sin solicitar un nombre).*

O si prefieres aplicarlas directamente sin entrar en modo interactivo:
```bash
npx prisma migrate deploy
```

### Regenerar el cliente de Prisma
```bash
npx prisma generate
```

### (Opcional) Poblar la base de datos con datos iniciales (Seed)
```bash
npm run seed
```

---

## 💻 3. Iniciar el Servidor

* **Modo desarrollo (con recarga automática):**
  ```bash
  npm run dev
  ```
* **Modo producción:**
  ```bash
  npm start
  ```

---

## 🛠️ 4. Flujo para Crear Nuevas Migraciones (Solo cuando modifiques `schema.prisma`)

Si tú eres quien realiza modificaciones en el modelo de datos (`prisma/schema.prisma`):

1. Realiza los cambios necesarios en [`prisma/schema.prisma`](./prisma/schema.prisma).
2. Genera y aplica la nueva migración:
   ```bash
   npx prisma migrate dev --name nombre_descriptivo_de_tu_cambio
   ```
   *Ejemplo:*
   ```bash
   npx prisma migrate dev --name agregar_campo_telefono_usuarios
   ```
3. Verifica que el archivo `.sql` generado en `prisma/migrations/` no contenga caracteres BOM y esté en codificación **UTF-8 estándar**.

---

## 🔍 5. Comandos de Diagnóstico y Estado

* **Ver el estado de las migraciones (verificar si la BD está sincronizada):**
  ```bash
  npx prisma migrate status
  ```
* **Validar la sintaxis del esquema:**
  ```bash
  npx prisma validate
  ```
