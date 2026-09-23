from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    name: str
    role: str  # 'admin', 'evaluador', 'lista'
    age_group: Optional[str] = None  # 'pre-infantiles', 'infantiles', 'juveniles'
    email: Optional[str] = None

class UserCreateSchema(UserBase):
    password: str
    court_id: Optional[str] = None

class UserUpdateSchema(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    age_group: Optional[str] = None
    court_id: Optional[str] = None

class UserResponseSchema(UserBase):
    id: str
    created_at: datetime
    court_id: Optional[str] = None
    court_name: Optional[str] = None

    class Config:
        from_attributes = True

class UserLoginSchema(BaseModel):
    name: str
    password: str


# --- AGE GROUP CONFIG SCHEMAS ---
class AgeGroupConfigBase(BaseModel):
    name: str
    min_age: int
    max_age: int

class AgeGroupConfigSchema(AgeGroupConfigBase):
    id: str

    class Config:
        from_attributes = True

class AgeGroupConfigUpdateSchema(BaseModel):
    min_age: int
    max_age: int


# --- EXAM SCHEMAS ---
class ExamBase(BaseModel):
    name: str
    date: str  # YYYY-MM-DD
    is_active: bool = False

class ExamCreateSchema(ExamBase):
    pass

class ExamSchema(ExamBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- BELT SCHEMAS ---
class BeltBase(BaseModel):
    name: str
    order_index: int
    color: str

class BeltSchema(BeltBase):
    id: str

    class Config:
        from_attributes = True


# --- STUDENT SCHEMAS ---
class StudentBase(BaseModel):
    first_name: str
    last_name: str
    belt_id: str
    rut: Optional[str] = None
    email: Optional[str] = None
    birth_date: Optional[str] = None
    sede: Optional[str] = None
    profesor: Optional[str] = None
    age: Optional[int] = None
    age_group: Optional[str] = None

class StudentCreateSchema(StudentBase):
    exam_id: Optional[str] = None

class StudentUpdateSchema(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    belt_id: Optional[str] = None
    rut: Optional[str] = None
    email: Optional[str] = None
    birth_date: Optional[str] = None
    sede: Optional[str] = None
    profesor: Optional[str] = None
    age: Optional[int] = None
    age_group: Optional[str] = None

class StudentSchema(StudentBase):
    id: str
    created_at: datetime
    belts: BeltSchema

    class Config:
        from_attributes = True



# --- ATTENDANCE SCHEMAS ---
class AttendanceBase(BaseModel):
    student_id: str
    exam_id: str
    date: str
    present: bool

class AttendanceCreateSchema(AttendanceBase):
    pass

class AttendanceSchema(AttendanceBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- EVALUATION SCHEMAS ---
class EvaluationBase(BaseModel):
    student_id: str
    evaluator_id: str
    exam_id: str
    category: str
    subcategory: Optional[str] = None
    rating: str
    notes: Optional[str] = None

class EvaluationCreateSchema(EvaluationBase):
    pass

class EvaluationSchema(EvaluationBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- EXAM RESULT SCHEMAS ---
class ExamResultBase(BaseModel):
    student_id: str
    exam_id: str
    final_score: str
    status: Optional[str] = "Promovido"
    general_notes: Optional[str] = None

class ExamResultCreateSchema(ExamResultBase):
    pass

class ExamResultSchema(ExamResultBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- COURT SCHEMAS ---
class CourtEvaluatorInfo(BaseModel):
    id: str
    evaluator_id: str
    name: str
    email: Optional[str] = None
    password: Optional[str] = None  # Only returned on creation

class CourtCreateSchema(BaseModel):
    name: str
    min_age: int
    max_age: int
    num_evaluators: int = 2
    allowed_belts: Optional[List[str]] = []
    evaluators: List['CourtEvaluatorCreateSchema']

class CourtUpdateSchema(BaseModel):
    min_age: int
    max_age: int
    name: Optional[str] = None
    allowed_belts: Optional[List[str]] = None


class CourtEvaluatorCreateSchema(BaseModel):
    name: str
    password: str
    email: Optional[str] = None

class CourtSchema(BaseModel):
    id: str
    exam_id: str
    name: str
    min_age: int
    max_age: int
    num_evaluators: int
    allowed_belts: Optional[List[str]] = []
    created_at: datetime
    evaluators: List[CourtEvaluatorInfo] = []
    students: List[StudentSchema] = []

    class Config:
        from_attributes = True


class CourtAssignStudentSchema(BaseModel):
    student_id: str

class StudentUpdateAgeSchema(BaseModel):
    age: int
