import uuid
import csv
import io
import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, File, UploadFile, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio

from .database import init_db, get_db
from .models import Belt, Student, Attendance, Evaluation, User, AgeGroupConfig, Exam, ExamResult, Court, CourtEvaluator
from .schemas import (
    BeltSchema, StudentSchema, StudentCreateSchema,
    AttendanceSchema, AttendanceCreateSchema,
    EvaluationSchema, EvaluationCreateSchema,
    UserResponseSchema, UserCreateSchema, UserLoginSchema,
    AgeGroupConfigSchema, ExamSchema, ExamCreateSchema,
    ExamResultSchema, ExamResultCreateSchema,
    CourtCreateSchema, CourtUpdateSchema, CourtSchema, CourtEvaluatorInfo,
    CourtAssignStudentSchema, StudentUpdateAgeSchema, StudentUpdateSchema
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

def broadcast_sync(message: dict):
    """Helper function to broadcast WebSocket events from synchronous endpoints"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(manager.broadcast(message))
    except Exception as e:
        print(f"WebSocket broadcast notice: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize and seed database
    init_db()
    yield

app = FastAPI(title="Taekwondo Evaluation System API", lifespan=lifespan)

# Add CORS middleware to allow development connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)



@app.post("/api/login", response_model=UserResponseSchema)
def login(login_in: UserLoginSchema, db: Session = Depends(get_db)):
    name_clean = login_in.name.strip()
    user = db.query(User).filter(User.name.ilike(name_clean)).first()
    if not user or user.password != login_in.password:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return user


@app.get("/api/users", response_model=List[UserResponseSchema])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).filter(User.role.in_(['evaluador', 'lista'])).all()


@app.post("/api/users", response_model=UserResponseSchema)
def create_user(user_in: UserCreateSchema, db: Session = Depends(get_db)):
    name_clean = user_in.name.strip()
    existing = db.query(User).filter(User.name.ilike(name_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario registrado con este nombre")
    
    email_val = user_in.email.lower().strip() if user_in.email else f"{name_clean.lower().replace(' ', '_')}@academia.local"
    new_user = User(
        id=str(uuid.uuid4()),
        email=email_val,
        password=user_in.password,
        role=user_in.role,
        name=name_clean,
        age_group=user_in.age_group
    )
    db.add(new_user)
    db.commit()

    if user_in.court_id:
        court = db.query(Court).filter(Court.id == user_in.court_id).first()
        if court:
            ce = CourtEvaluator(
                id=str(uuid.uuid4()),
                court_id=user_in.court_id,
                evaluator_id=new_user.id
            )
            db.add(ce)
            db.commit()

    db.refresh(new_user)
    return new_user


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"message": "Usuario eliminado correctamente"}


@app.get("/api/age-groups", response_model=List[AgeGroupConfigSchema])
def get_age_groups(db: Session = Depends(get_db)):
    return db.query(AgeGroupConfig).all()


@app.put("/api/age-groups", response_model=List[AgeGroupConfigSchema])
def update_age_groups(configs_in: List[AgeGroupConfigSchema], db: Session = Depends(get_db)):
    for cfg in configs_in:
        db_cfg = db.query(AgeGroupConfig).filter(AgeGroupConfig.id == cfg.id).first()
        if db_cfg:
            db_cfg.min_age = cfg.min_age
            db_cfg.max_age = cfg.max_age
    db.commit()

    # Recalculate age groups for all students
    students = db.query(Student).all()
    configs = db.query(AgeGroupConfig).all()

    for student in students:
        if student.age is not None:
            matched_group = None
            for cfg in configs:
                if cfg.min_age <= student.age <= cfg.max_age:
                    matched_group = cfg.id
                    break
            student.age_group = matched_group
    
    db.commit()
    return db.query(AgeGroupConfig).all()


# --- EXAM ENDPOINTS ---
@app.get("/api/exams", response_model=List[ExamSchema])
def get_exams(db: Session = Depends(get_db)):
    return db.query(Exam).order_by(Exam.created_at.desc()).all()


@app.post("/api/exams", response_model=ExamSchema)
def create_exam(exam_in: ExamCreateSchema, db: Session = Depends(get_db)):
    # Deactivate all current exams
    db.query(Exam).update({Exam.is_active: False})
    
    new_exam = Exam(
        id=str(uuid.uuid4()),
        name=exam_in.name,
        date=exam_in.date,
        is_active=True
    )
    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)
    return new_exam


@app.put("/api/exams/{exam_id}/activate", response_model=ExamSchema)
def activate_exam(exam_id: str, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
        
    db.query(Exam).update({Exam.is_active: False})
    exam.is_active = True
    db.commit()
    db.refresh(exam)
    return exam


@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: str, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
        
    was_active = exam.is_active
    db.delete(exam)
    db.commit()

    # If the deleted exam was active, activate the most recent remaining exam if any
    if was_active:
        latest_exam = db.query(Exam).order_by(Exam.created_at.desc()).first()
        if latest_exam:
            latest_exam.is_active = True
            db.commit()

    return {"message": "Examen eliminado correctamente"}


@app.get("/api/belts", response_model=List[BeltSchema])
def get_belts(db: Session = Depends(get_db)):
    return db.query(Belt).order_by(Belt.order_index).all()


@app.get("/api/students", response_model=List[StudentSchema])
def get_students(
    order: str = Query("belt", pattern="^(belt|first_name|last_name)$"),
    db: Session = Depends(get_db)
):
    students = db.query(Student).all()
    if order == "last_name":
        students.sort(key=lambda s: (s.last_name or '', s.first_name or ''))
    elif order == "first_name":
        students.sort(key=lambda s: (s.first_name or '', s.last_name or ''))
    else:
        students = sort_students_by_belt(students)
    return students


@app.post("/api/students", response_model=StudentSchema)
def create_student(
    student_in: StudentCreateSchema,
    db: Session = Depends(get_db)
):
    # Verify belt exists
    belt = db.query(Belt).filter(Belt.id == student_in.belt_id).first()
    if not belt:
        belt = db.query(Belt).order_by(Belt.order_index).first()
        if not belt:
            raise HTTPException(status_code=400, detail="No se encontró un cinturón válido")

    age = student_in.age
    birth_date = student_in.birth_date
    if birth_date and age is None:
        parsed_date, calculated_age = parse_birth_date(birth_date)
        if calculated_age is not None:
            age = calculated_age
            birth_date = parsed_date

    age_group = student_in.age_group
    if age is not None and not age_group:
        configs = db.query(AgeGroupConfig).all()
        for cfg in configs:
            if cfg.min_age <= age <= cfg.max_age:
                age_group = cfg.id
                break

    first_name = student_in.first_name.strip().title()
    last_name = student_in.last_name.strip().title()
    rut = student_in.rut.strip() if student_in.rut else None
    email = student_in.email.strip().lower() if student_in.email else None
    sede = student_in.sede.strip() if student_in.sede else None
    profesor = student_in.profesor.strip() if student_in.profesor else None

    # Check for existing student by RUT or Name
    existing_student = None
    if rut:
        existing_student = db.query(Student).filter(Student.rut == rut).first()
    if not existing_student:
        existing_student = db.query(Student).filter(
            Student.first_name == first_name,
            Student.last_name == last_name
        ).first()

    if existing_student:
        existing_student.belt_id = belt.id
        if age is not None:
            existing_student.age = age
            existing_student.age_group = age_group
        if rut:
            existing_student.rut = rut
        if email:
            existing_student.email = email
        if birth_date:
            existing_student.birth_date = birth_date
        if sede:
            existing_student.sede = sede
        if profesor:
            existing_student.profesor = profesor
        target_student = existing_student
    else:
        target_student = Student(
            id=str(uuid.uuid4()),
            first_name=first_name,
            last_name=last_name,
            rut=rut,
            email=email,
            birth_date=birth_date,
            sede=sede,
            profesor=profesor,
            belt_id=belt.id,
            age=age,
            age_group=age_group
        )
        db.add(target_student)

    # Link student to exam if exam_id is provided
    if student_in.exam_id:
        target_exam = db.query(Exam).filter(Exam.id == student_in.exam_id).first()
        if target_exam:
            existing_att = db.query(Attendance).filter(
                Attendance.student_id == target_student.id,
                Attendance.exam_id == target_exam.id
            ).first()
            if not existing_att:
                db_att = Attendance(
                    id=str(uuid.uuid4()),
                    student_id=target_student.id,
                    exam_id=target_exam.id,
                    date=target_exam.date,
                    present=True
                )
                db.add(db_att)

    db.commit()
    db.refresh(target_student)
    return target_student



@app.get("/api/attendance", response_model=List[AttendanceSchema])
def get_attendance(
    date: str,
    exam_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if not exam_id:
        active_exam = db.query(Exam).filter(Exam.is_active == True).first()
        if not active_exam:
            return []
        exam_id = active_exam.id
    return db.query(Attendance).filter(Attendance.date == date, Attendance.exam_id == exam_id).all()


@app.post("/api/attendance", response_model=AttendanceSchema)
def save_attendance(
    attendance_in: AttendanceCreateSchema,
    db: Session = Depends(get_db)
):
    # Check if student exists
    student = db.query(Student).filter(Student.id == attendance_in.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Check if exam exists
    exam = db.query(Exam).filter(Exam.id == attendance_in.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    # Check if attendance record already exists for student + date + exam
    existing = db.query(Attendance).filter(
        Attendance.student_id == attendance_in.student_id,
        Attendance.date == attendance_in.date,
        Attendance.exam_id == attendance_in.exam_id
    ).first()
    
    if existing:
        existing.present = attendance_in.present
        db.commit()
        db.refresh(existing)
        res = existing
    else:
        db_attendance = Attendance(
            id=str(uuid.uuid4()),
            student_id=attendance_in.student_id,
            exam_id=attendance_in.exam_id,
            date=attendance_in.date,
            present=attendance_in.present
        )
        db.add(db_attendance)
        db.commit()
        db.refresh(db_attendance)
        res = db_attendance

    broadcast_sync({
        "type": "ATTENDANCE_UPDATED",
        "student_id": attendance_in.student_id,
        "exam_id": attendance_in.exam_id,
        "present": attendance_in.present
    })
    return res


@app.get("/api/evaluations", response_model=List[EvaluationSchema])
def get_evaluations(exam_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Evaluation)
    if exam_id:
        query = query.filter(Evaluation.exam_id == exam_id)
    else:
        active_exam = db.query(Exam).filter(Exam.is_active == True).first()
        if active_exam:
            query = query.filter(Evaluation.exam_id == active_exam.id)
        else:
            return []
    return query.all()


@app.post("/api/evaluations", response_model=EvaluationSchema)
def save_evaluation(
    evaluation_in: EvaluationCreateSchema,
    db: Session = Depends(get_db)
):
    # Check if student exists
    student = db.query(Student).filter(Student.id == evaluation_in.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Check if evaluator exists
    evaluator = db.query(User).filter(User.id == evaluation_in.evaluator_id).first()
    if not evaluator:
        raise HTTPException(status_code=404, detail="Evaluator not found")

    # Check if exam exists
    exam = db.query(Exam).filter(Exam.id == evaluation_in.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Check if evaluation record already exists for student + category + subcategory + evaluator + exam
    existing = db.query(Evaluation).filter(
        Evaluation.student_id == evaluation_in.student_id,
        Evaluation.category == evaluation_in.category,
        Evaluation.subcategory == evaluation_in.subcategory,
        Evaluation.evaluator_id == evaluation_in.evaluator_id,
        Evaluation.exam_id == evaluation_in.exam_id
    ).first()
    
    if existing:
        existing.rating = evaluation_in.rating
        existing.notes = evaluation_in.notes
        db.commit()
        db.refresh(existing)
        res = existing
    else:
        db_evaluation = Evaluation(
            id=str(uuid.uuid4()),
            student_id=evaluation_in.student_id,
            evaluator_id=evaluation_in.evaluator_id,
            exam_id=evaluation_in.exam_id,
            category=evaluation_in.category,
            subcategory=evaluation_in.subcategory,
            rating=evaluation_in.rating,
            notes=evaluation_in.notes
        )
        db.add(db_evaluation)
        db.commit()
        db.refresh(db_evaluation)
        res = db_evaluation

    broadcast_sync({
        "type": "EVALUATION_SAVED",
        "student_id": evaluation_in.student_id,
        "exam_id": evaluation_in.exam_id,
        "evaluator_id": evaluation_in.evaluator_id,
        "category": evaluation_in.category,
        "subcategory": evaluation_in.subcategory,
        "rating": evaluation_in.rating
    })
    return res


# --- EXAM RESULT ENDPOINTS ---
@app.get("/api/exam-results", response_model=List[ExamResultSchema])
def get_exam_results(
    exam_id: Optional[str] = None,
    student_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ExamResult)
    if exam_id:
        query = query.filter(ExamResult.exam_id == exam_id)
    else:
        active_exam = db.query(Exam).filter(Exam.is_active == True).first()
        if active_exam:
            query = query.filter(ExamResult.exam_id == active_exam.id)
        else:
            return []
            
    if student_id:
        query = query.filter(ExamResult.student_id == student_id)
        
    return query.all()


@app.post("/api/exam-results", response_model=ExamResultSchema)
def save_exam_result(
    result_in: ExamResultCreateSchema,
    db: Session = Depends(get_db)
):
    # Check if student exists
    student = db.query(Student).filter(Student.id == result_in.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Check if exam exists
    exam = db.query(Exam).filter(Exam.id == result_in.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Check if result record already exists for student + exam
    existing = db.query(ExamResult).filter(
        ExamResult.student_id == result_in.student_id,
        ExamResult.exam_id == result_in.exam_id
    ).first()
    
    if existing:
        existing.final_score = result_in.final_score
        existing.status = result_in.status
        existing.general_notes = result_in.general_notes
        db.commit()
        db.refresh(existing)
        return existing
    else:
        db_result = ExamResult(
            id=str(uuid.uuid4()),
            student_id=result_in.student_id,
            exam_id=result_in.exam_id,
            final_score=result_in.final_score,
            status=result_in.status,
            general_notes=result_in.general_notes
        )
        db.add(db_result)
        db.commit()
        db.refresh(db_result)
        return db_result


def sort_students_by_belt(students_list):
    return sorted(
        students_list,
        key=lambda s: (
            s.belts.order_index if (s.belts and hasattr(s.belts, 'order_index')) else 999,
            s.last_name or '',
            s.first_name or ''
        )
    )


# --- CSV IMPORT ENDPOINT ---
def parse_birth_date(date_str: str):
    if not date_str:
        return None, None
    date_str = date_str.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            dt = datetime.datetime.strptime(date_str, fmt)
            today = datetime.date.today()
            age = today.year - dt.year - ((today.month, today.day) < (dt.month, dt.day))
            return dt.strftime("%Y-%m-%d"), age
        except ValueError:
            pass
    return date_str, None


def resolve_belt_from_text(raw_text: str, belts_in_db: List[Belt]) -> Belt:
    if not raw_text or not raw_text.strip():
        for b in belts_in_db:
            if b.name.lower() == "blanco":
                return b
        return belts_in_db[0] if belts_in_db else None

    import re
    t = raw_text.lower().strip()
    t = re.sub(r'-\s*\d+°?\s*gup.*', '', t)
    t = re.sub(r'\d+°?\s*gup.*', '', t)
    t = t.strip(" -:")

    ALIAS_MAP = {
        "blanco amarillo": "Blanco-Amarillo",
        "blanco-amarillo": "Blanco-Amarillo",
        "blanco punta amarilla": "Blanco-Amarillo",
        "punta amarilla": "Blanco-Amarillo",

        "amarillo verde": "Amarillo-Verde",
        "amarillo-verde": "Amarillo-Verde",
        "amarillo punta verde": "Amarillo-Verde",
        "punta verde": "Amarillo-Verde",

        "verde azul": "Verde-Azul",
        "verde-azul": "Verde-Azul",
        "verde punta azul": "Verde-Azul",
        "punta azul": "Verde-Azul",

        "azul rojo": "Azul-Rojo",
        "azul-rojo": "Azul-Rojo",
        "azul punta roja": "Azul-Rojo",
        "azul punta rojo": "Azul-Rojo",
        "punta roja": "Azul-Rojo",

        "rojo negro": "Rojo-Negro",
        "rojo-negro": "Rojo-Negro",
        "rojo punta negra": "Rojo-Negro",
        "punta negra": "Rojo-Negro",
        "poom": "Rojo-Negro",

        "blanco": "Blanco",
        "amarillo": "Amarillo",
        "verde": "Verde",
        "azul": "Azul",
        "rojo": "Rojo",
        "negro": "Negro",
    }

    target_canonical = ALIAS_MAP.get(t)

    if not target_canonical:
        sorted_keys = sorted(ALIAS_MAP.keys(), key=lambda k: len(k), reverse=True)
        raw_lower = raw_text.lower()
        for k in sorted_keys:
            if k in t or k in raw_lower:
                target_canonical = ALIAS_MAP[k]
                break

    if target_canonical:
        for b in belts_in_db:
            if b.name.lower() == target_canonical.lower() or b.name.lower().replace("-", " ") == target_canonical.lower().replace("-", " "):
                return b

    for b in belts_in_db:
        b_clean = b.name.lower().replace("-", " ").strip()
        if b_clean == t or b.name.lower() == t:
            return b

    for b in belts_in_db:
        if b.name.lower() == "blanco":
            return b

    return belts_in_db[0]


@app.post("/api/students/import-csv")

async def import_students_csv(
    file: UploadFile = File(...),
    exam_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith(('.csv', '.txt')):
        raise HTTPException(status_code=400, detail="El archivo debe tener formato CSV")
        
    contents = await file.read()
    decoded = None
    for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
        try:
            decoded = contents.decode(encoding)
            break
        except UnicodeDecodeError:
            pass
            
    if decoded is None:
        raise HTTPException(status_code=400, detail="No se pudo decodificar el archivo CSV")
        
    reader = csv.reader(io.StringIO(decoded))
    rows = list(reader)
    if not rows:
        return {"message": "Archivo CSV vacío", "total_rows": 0, "imported_count": 0, "updated_count": 0, "skipped_count": 0, "details": []}
        
    headers = [h.strip() for h in rows[0]]
    
    def find_col_idx(keywords):
        for idx, h in enumerate(headers):
            h_clean = h.lower().replace(":", "").replace("¿", "").replace("?", "").strip()
            for kw in keywords:
                if kw in h_clean:
                    return idx
        return -1

    idx_rinde = find_col_idx(["rinde examen", "rinde"])
    idx_email = find_col_idx(["dirección de correo", "correo", "email"])
    idx_rut = find_col_idx(["rut"])
    idx_nombre = find_col_idx(["nombre"])
    idx_paterno = find_col_idx(["apellido paterno", "paterno"])
    idx_materno = find_col_idx(["apellido materno", "materno"])
    idx_nacimiento = find_col_idx(["fecha de nacimiento", "nacimiento"])
    idx_sede = find_col_idx(["sede"])
    idx_profesor = find_col_idx(["profesor"])
    belt_col_indices = []
    for idx, h in enumerate(headers):
        h_clean = h.lower().replace(":", "").replace("¿", "").replace("?", "").strip()
        if "cinturon" in h_clean or "cinturón" in h_clean or "grado" in h_clean:
            belt_col_indices.append(idx)

    belts = db.query(Belt).all()
    age_configs = db.query(AgeGroupConfig).all()

    # Retrieve exam if exam_id is provided
    target_exam = None
    if exam_id:
        target_exam = db.query(Exam).filter(Exam.id == exam_id).first()

    imported_count = 0
    updated_count = 0
    skipped_count = 0
    details = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if not row or not any(row):
            continue
            
        def get_val(idx):
            return row[idx].strip() if 0 <= idx < len(row) else ""

        rinde = get_val(idx_rinde).lower()
        if rinde and rinde not in ["si", "sí", "yes", "true", "1"]:
            skipped_count += 1
            continue

        first_name = get_val(idx_nombre).strip().title()
        paterno = get_val(idx_paterno).strip().title()
        materno = get_val(idx_materno).strip().title()
        
        last_name = f"{paterno} {materno}".strip()
        if not first_name:
            skipped_count += 1
            continue

        rut = get_val(idx_rut)
        email = get_val(idx_email)
        sede = get_val(idx_sede)
        profesor = get_val(idx_profesor)
        raw_birth = get_val(idx_nacimiento)

        # Retrieve raw belt string by checking candidate columns (first non-empty value)
        raw_cinturon = ""
        for c_idx in belt_col_indices:
            val = get_val(c_idx)
            if val:
                raw_cinturon = val
                break

        birth_date, age = parse_birth_date(raw_birth)

        age_group = None
        if age is not None:
            for cfg in age_configs:
                if cfg.min_age <= age <= cfg.max_age:
                    age_group = cfg.id
                    break

        target_belt = resolve_belt_from_text(raw_cinturon, belts)
        belt_id = target_belt.id


        existing_student = None
        if rut:
            existing_student = db.query(Student).filter(Student.rut == rut).first()
        if not existing_student:
            existing_student = db.query(Student).filter(
                Student.first_name == first_name,
                Student.last_name == last_name
            ).first()

        target_student = None

        if existing_student:
            existing_student.belt_id = belt_id
            if age is not None:
                existing_student.age = age
                existing_student.age_group = age_group
            if rut:
                existing_student.rut = rut
            if email:
                existing_student.email = email
            if birth_date:
                existing_student.birth_date = birth_date
            if sede:
                existing_student.sede = sede
            if profesor:
                existing_student.profesor = profesor
            target_student = existing_student
            updated_count += 1
            details.append(f"Actualizado: {first_name} {last_name}")
        else:
            new_student = Student(
                id=str(uuid.uuid4()),
                first_name=first_name,
                last_name=last_name,
                rut=rut,
                email=email,
                birth_date=birth_date,
                sede=sede,
                profesor=profesor,
                belt_id=belt_id,
                age=age,
                age_group=age_group
            )
            db.add(new_student)
            target_student = new_student
            imported_count += 1
            details.append(f"Creado: {first_name} {last_name}")

        # Register attendance / exam mapping if target_exam is present
        if target_exam and target_student:
            existing_att = db.query(Attendance).filter(
                Attendance.student_id == target_student.id,
                Attendance.exam_id == target_exam.id
            ).first()
            if not existing_att:
                db_att = Attendance(
                    id=str(uuid.uuid4()),
                    student_id=target_student.id,
                    exam_id=target_exam.id,
                    date=target_exam.date,
                    present=True
                )
                db.add(db_att)

    db.commit()
    return {
        "message": "Importación completada con éxito",
        "total_rows": len(rows) - 1,
        "imported_count": imported_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "details": details
    }


@app.get("/api/exams/{exam_id}/students", response_model=List[StudentSchema])
def get_exam_students(exam_id: str, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")
        
    # Get students registered in attendance for this exam
    attendance_records = db.query(Attendance).filter(Attendance.exam_id == exam_id).all()
    student_ids = [att.student_id for att in attendance_records]
    
    if not student_ids:
        return []
        
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    return sort_students_by_belt(students)



# --- COURT HELPERS ---
def parse_court_allowed_belts(court: Court) -> List[str]:
    if not court.allowed_belts:
        return []
    try:
        data = json.loads(court.allowed_belts)
        if isinstance(data, list):
            return [str(b).strip() for b in data if str(b).strip()]
    except Exception:
        pass
    return []

def student_matches_court(student: Student, court: Court) -> bool:
    if student.age is None:
        return False
    if not (court.min_age <= student.age <= court.max_age):
        return False
    
    allowed = parse_court_allowed_belts(court)
    if not allowed:
        return True  # No belt restriction -> all belts allowed
    
    student_belt_name = student.belts.name if getattr(student, 'belts', None) else ""
    student_belt_id = student.belt_id or ""

    
    return (student_belt_id in allowed) or (student_belt_name in allowed)


# --- COURT ENDPOINTS ---
@app.post("/api/exams/{exam_id}/courts", response_model=CourtSchema)
def create_court(
    exam_id: str,
    court_in: CourtCreateSchema,
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    if len(court_in.evaluators) != court_in.num_evaluators:
        raise HTTPException(
            status_code=400,
            detail=f"Debes proporcionar exactamente {court_in.num_evaluators} evaluadores"
        )

    allowed_belts_str = json.dumps(court_in.allowed_belts) if court_in.allowed_belts else None

    # Create the court
    court_id = str(uuid.uuid4())
    new_court = Court(
        id=court_id,
        exam_id=exam_id,
        name=court_in.name,
        min_age=court_in.min_age,
        max_age=court_in.max_age,
        num_evaluators=court_in.num_evaluators,
        allowed_belts=allowed_belts_str
    )
    db.add(new_court)

    # Create evaluator users and link them to the court
    evaluator_infos = []
    for ev_data in court_in.evaluators:
        # Check if user already exists by name
        name_clean = ev_data.name.strip()
        existing_user = db.query(User).filter(User.name.ilike(name_clean)).first()
        if existing_user:
            # Link existing user to this court
            evaluator_user = existing_user
        else:
            email_val = ev_data.email.lower().strip() if ev_data.email else f"{name_clean.lower().replace(' ', '_')}@academia.local"
            evaluator_user = User(
                id=str(uuid.uuid4()),
                email=email_val,
                password=ev_data.password,
                role='evaluador',
                name=name_clean,
                age_group=None
            )
            db.add(evaluator_user)

        ce = CourtEvaluator(
            id=str(uuid.uuid4()),
            court_id=court_id,
            evaluator_id=evaluator_user.id
        )
        db.add(ce)

        evaluator_infos.append(CourtEvaluatorInfo(
            id=ce.id,
            evaluator_id=evaluator_user.id,
            email=evaluator_user.email,
            name=evaluator_user.name,
            password=ev_data.password  # Return password only on creation
        ))

    db.commit()
    db.refresh(new_court)

    # Get auto-assigned students for this court
    attendance_records = db.query(Attendance).filter(Attendance.exam_id == exam_id).all()
    student_ids = [att.student_id for att in attendance_records]
    court_students = []
    if student_ids:
        all_students = db.query(Student).filter(Student.id.in_(student_ids)).all()
        court_students = [s for s in all_students if student_matches_court(s, new_court)]
        court_students = sort_students_by_belt(court_students)

    return CourtSchema(
        id=new_court.id,
        exam_id=new_court.exam_id,
        name=new_court.name,
        min_age=new_court.min_age,
        max_age=new_court.max_age,
        num_evaluators=new_court.num_evaluators,
        allowed_belts=parse_court_allowed_belts(new_court),
        created_at=new_court.created_at,
        evaluators=evaluator_infos,
        students=[StudentSchema.model_validate(s) for s in court_students]
    )


@app.get("/api/exams/{exam_id}/courts", response_model=List[CourtSchema])
def get_exam_courts(exam_id: str, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    courts = db.query(Court).filter(Court.exam_id == exam_id).order_by(Court.created_at).all()

    # Get all students enrolled in this exam
    attendance_records = db.query(Attendance).filter(Attendance.exam_id == exam_id).all()
    student_ids = [att.student_id for att in attendance_records]
    all_students = []
    if student_ids:
        all_students = db.query(Student).filter(Student.id.in_(student_ids)).all()

    result = []
    for court in courts:
        # Build evaluator info
        ev_infos = []
        for ce in court.court_evaluators:
            ev_infos.append(CourtEvaluatorInfo(
                id=ce.id,
                evaluator_id=ce.evaluator_id,
                email=ce.evaluator.email,
                name=ce.evaluator.name,
                password=None
            ))

        # Auto-assign students by age range & allowed belts
        court_students = [s for s in all_students if student_matches_court(s, court)]
        court_students = sort_students_by_belt(court_students)

        result.append(CourtSchema(
            id=court.id,
            exam_id=court.exam_id,
            name=court.name,
            min_age=court.min_age,
            max_age=court.max_age,
            num_evaluators=court.num_evaluators,
            allowed_belts=parse_court_allowed_belts(court),
            created_at=court.created_at,
            evaluators=ev_infos,
            students=[StudentSchema.model_validate(s) for s in court_students]
        ))

    return result


@app.get("/api/exams/{exam_id}/unassigned-students", response_model=List[StudentSchema])
def get_unassigned_students(exam_id: str, db: Session = Depends(get_db)):
    """Get students enrolled in an exam who don't fall into any court's criteria."""
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    courts = db.query(Court).filter(Court.exam_id == exam_id).all()
    attendance_records = db.query(Attendance).filter(Attendance.exam_id == exam_id).all()
    student_ids = [att.student_id for att in attendance_records]

    if not student_ids:
        return []

    all_students = db.query(Student).filter(Student.id.in_(student_ids)).all()

    unassigned = []
    for s in all_students:
        if s.age is None:
            unassigned.append(s)
        else:
            in_any_court = any(student_matches_court(s, c) for c in courts)
            if not in_any_court:
                unassigned.append(s)

    return sort_students_by_belt(unassigned)


@app.get("/api/exams/{exam_id}/evaluator-students/{user_id}", response_model=List[StudentSchema])
def get_evaluator_students_for_exam(
    exam_id: str,
    user_id: str,
    db: Session = Depends(get_db)
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examen no encontrado")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    attendance_records = db.query(Attendance).filter(Attendance.exam_id == exam_id).all()
    student_ids = [att.student_id for att in attendance_records]
    if not student_ids:
        return []

    enrolled_students = db.query(Student).filter(Student.id.in_(student_ids)).all()

    # Check court assignments
    court_evaluators = db.query(CourtEvaluator).join(Court).filter(
        CourtEvaluator.evaluator_id == user_id,
        Court.exam_id == exam_id
    ).all()

    if court_evaluators:
        courts = [ce.court for ce in court_evaluators]
        evaluator_students = []
        for s in enrolled_students:
            if any(student_matches_court(s, c) for c in courts):
                evaluator_students.append(s)
        return sort_students_by_belt(evaluator_students)

    if user.age_group:
        evaluator_students = [s for s in enrolled_students if s.age_group == user.age_group]
        return sort_students_by_belt(evaluator_students)

    return sort_students_by_belt(enrolled_students)


@app.get("/api/exams/{exam_id}/evaluator-court/{user_id}")
def get_evaluator_court_info(
    exam_id: str,
    user_id: str,
    db: Session = Depends(get_db)
):
    court_evaluator = db.query(CourtEvaluator).join(Court).filter(
        CourtEvaluator.evaluator_id == user_id,
        Court.exam_id == exam_id
    ).first()

    if court_evaluator and court_evaluator.court:
        court = court_evaluator.court
        return {
            "id": court.id,
            "name": court.name,
            "min_age": court.min_age,
            "max_age": court.max_age,
            "allowed_belts": parse_court_allowed_belts(court)
        }

    user = db.query(User).filter(User.id == user_id).first()
    if user and user.age_group:
        return {
            "name": f"Categoría {user.age_group.capitalize()}",
            "min_age": None,
            "max_age": None,
            "allowed_belts": []
        }

    return {"name": "Todas las Canchas", "min_age": None, "max_age": None, "allowed_belts": []}


@app.delete("/api/courts/{court_id}")
def delete_court(court_id: str, db: Session = Depends(get_db)):
    court = db.query(Court).filter(Court.id == court_id).first()
    if not court:
        raise HTTPException(status_code=404, detail="Cancha no encontrada")
    db.delete(court)
    db.commit()
    return {"message": "Cancha eliminada correctamente"}


@app.put("/api/courts/{court_id}", response_model=CourtSchema)
def update_court(court_id: str, body: CourtUpdateSchema, db: Session = Depends(get_db)):
    court = db.query(Court).filter(Court.id == court_id).first()
    if not court:
        raise HTTPException(status_code=404, detail="Cancha no encontrada")

    court.min_age = body.min_age
    court.max_age = body.max_age
    if body.name is not None and body.name.strip():
        court.name = body.name.strip()
    if body.allowed_belts is not None:
        court.allowed_belts = json.dumps(body.allowed_belts)

    db.commit()
    db.refresh(court)

    # Build evaluator info
    ev_infos = []
    for ce in court.court_evaluators:
        ev_infos.append(CourtEvaluatorInfo(
            id=ce.id,
            evaluator_id=ce.evaluator_id,
            email=ce.evaluator.email,
            name=ce.evaluator.name,
            password=None
        ))

    # Auto-assign students by age range & allowed belts
    attendance_records = db.query(Attendance).filter(Attendance.exam_id == court.exam_id).all()
    student_ids = [att.student_id for att in attendance_records]
    court_students = []
    if student_ids:
        all_students = db.query(Student).filter(Student.id.in_(student_ids)).all()
        court_students = [s for s in all_students if student_matches_court(s, court)]
        court_students = sort_students_by_belt(court_students)

    return CourtSchema(
        id=court.id,
        exam_id=court.exam_id,
        name=court.name,
        min_age=court.min_age,
        max_age=court.max_age,
        num_evaluators=court.num_evaluators,
        allowed_belts=parse_court_allowed_belts(court),
        created_at=court.created_at,
        evaluators=ev_infos,
        students=[StudentSchema.model_validate(s) for s in court_students]
    )




@app.put("/api/students/{student_id}/age", response_model=StudentSchema)
def update_student_age(
    student_id: str,
    body: StudentUpdateAgeSchema,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")
    student.age = body.age
    # Recalculate age_group
    configs = db.query(AgeGroupConfig).all()
    student.age_group = None
    for cfg in configs:
        if cfg.min_age <= body.age <= cfg.max_age:
            student.age_group = cfg.id
            break
    db.commit()
    db.refresh(student)
    return student


@app.put("/api/students/{student_id}", response_model=StudentSchema)
def update_student(
    student_id: str,
    body: StudentUpdateSchema,
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")

    if body.first_name is not None and body.first_name.strip():
        student.first_name = body.first_name.strip().title()
    if body.last_name is not None and body.last_name.strip():
        student.last_name = body.last_name.strip().title()
    if body.belt_id is not None:
        student.belt_id = body.belt_id
    if body.rut is not None:
        student.rut = body.rut.strip() if body.rut.strip() else None
    if body.email is not None:
        student.email = body.email.strip().lower() if body.email.strip() else None
    if body.birth_date is not None:
        student.birth_date = body.birth_date.strip() if body.birth_date.strip() else None
    if body.sede is not None:
        student.sede = body.sede.strip() if body.sede.strip() else None
    if body.profesor is not None:
        student.profesor = body.profesor.strip() if body.profesor.strip() else None
    if body.age is not None:
        student.age = body.age
        # Recalculate age_group
        configs = db.query(AgeGroupConfig).all()
        student.age_group = None
        for cfg in configs:
            if cfg.min_age <= body.age <= cfg.max_age:
                student.age_group = cfg.id
                break

    db.commit()
    db.refresh(student)
    return student


@app.delete("/api/students/{student_id}")
def delete_student(student_id: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Alumno no encontrado")
    db.delete(student)
    db.commit()
    return {"message": "Alumno eliminado correctamente"}
