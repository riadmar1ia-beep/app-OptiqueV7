import { Request, Response } from "express";
import { AppDataSource } from "../../infrastructure/database/data-source";
import { User } from "../../domain/entities/User";

export class UserController {
  static async getAll(req: Request, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const users = await userRepo.find();
      res.json({ success: true, data: users });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.params.id } });
      
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = userRepo.create(req.body);
      await userRepo.save(user);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: req.params.id } });
      
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      
      userRepo.merge(user, req.body);
      await userRepo.save(user);
      res.json({ success: true, data: user });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const result = await userRepo.delete(req.params.id);
      
      if (result.affected === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      
      res.json({ success: true, message: "User deleted" });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
